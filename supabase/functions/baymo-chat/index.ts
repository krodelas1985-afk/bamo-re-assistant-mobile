import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * BayMo assistant chat proxy.
 *
 * - General chat  -> OpenAI gpt-4o (OPENAI_API_KEY, already set on this project).
 * - Document mode -> Anthropic claude-opus-4-8 when ANTHROPIC_API_KEY is set,
 *   otherwise falls back to OpenAI so the feature works before the key lands.
 *
 * JWT-verified (verify_jwt=true). We derive the caller's client_id + role from
 * their profile and inject their real hot leads / week stats so answers are
 * grounded in the agent's own pipeline. Keys never ship in the mobile app.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OPENAI_MODEL = 'gpt-4o';
const ANTHROPIC_MODEL = 'claude-opus-4-8';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return j({ error: 'POST only' }, 405);

  let payload: { messages?: ChatMessage[]; task?: 'chat' | 'document'; document_type?: string };
  try {
    payload = await req.json();
  } catch {
    return j({ error: 'Invalid JSON body' }, 400);
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const task = payload.task === 'document' ? 'document' : 'chat';
  if (messages.length === 0) return j({ error: 'messages is required' }, 400);

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  // verify_jwt=true already validated the token; decode its `sub` (user id) directly.
  let uid = '';
  try {
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    uid = claims.sub ?? '';
  } catch {
    // invalid token shape
  }
  if (!uid) return j({ error: 'Not authenticated' }, 401);

  // Service-role client for reads; we scope by the caller's own client_id in code.
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, role, client_id')
    .eq('id', uid)
    .maybeSingle();

  const agentName = (profile?.full_name ?? '').split(/\s+/)[0] || 'there';

  // Ground the assistant in the agent's real pipeline (RLS-equivalent scoping).
  let context = 'No lead data available yet.';
  if (profile?.client_id) {
    let leadQ = admin
      .from('leads')
      .select('name, lead_temperature, status, source, conversation_summary')
      .eq('client_id', profile.client_id);
    if (profile.role === 'agent') leadQ = leadQ.eq('assigned_user_id', uid);

    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const [{ data: hot }, { count: hotCount }, { count: newWeek }] = await Promise.all([
      leadQ.eq('lead_temperature', 'Hot').limit(10),
      admin.from('leads').select('id', { count: 'exact', head: true })
        .eq('client_id', profile.client_id).eq('lead_temperature', 'Hot'),
      admin.from('leads').select('id', { count: 'exact', head: true })
        .eq('client_id', profile.client_id).gte('created_at', weekAgo),
    ]);
    const hotList = (hot ?? [])
      .map((l) => `- ${l.name} (${l.source ?? 'unknown'}): ${l.conversation_summary ?? 'no summary yet'}`)
      .join('\n');
    context =
      `Hot leads right now: ${hotCount ?? 0}. New leads this week: ${newWeek ?? 0}.\n` +
      (hotList ? `Hot lead details:\n${hotList}` : 'No hot leads at the moment.');
  }

  const chatSystem =
    `You are BayMo, the friendly AI assistant inside the BaMo real estate app for Philippine ` +
    `agents, brokers, and developers. You are talking to ${agentName}. Speak warm, encouraging ` +
    `Taglish (natural Filipino-English mix), concise, mobile-friendly. Help with their leads, ` +
    `follow-ups, and real estate questions. Use ONLY the pipeline data below for anything about ` +
    `their leads or numbers — never invent leads, names, or figures. If asked to draft a document, ` +
    `produce a clean, professional Philippine real estate document.\n\n` +
    `AGENT PIPELINE CONTEXT:\n${context}`;

  const docSystem =
    `You are BayMo, drafting a professional Philippine real estate document` +
    (payload.document_type ? ` (${payload.document_type})` : '') +
    ` for the agent ${agentName}. Produce a clean, ready-to-edit draft using standard PH real ` +
    `estate conventions (PHP amounts, Pag-IBIG/bank financing where relevant). Use clearly marked ` +
    `[BRACKETED] placeholders for any detail the agent must fill in (names, TCT numbers, dates, ` +
    `amounts). Do not invent specific facts. Return only the document text.`;

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

  // Document mode -> Anthropic when available.
  if (task === 'document' && anthropicKey) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 4096,
          system: docSystem,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        return j({ error: `Anthropic error ${resp.status}`, detail: t.slice(0, 500) }, 502);
      }
      const data = await resp.json();
      const reply = (data.content ?? []).find((b: { type: string }) => b.type === 'text')?.text ?? '';
      return j({ reply, model_used: ANTHROPIC_MODEL });
    } catch (e) {
      return j({ error: `Anthropic call failed: ${String(e)}` }, 502);
    }
  }

  // Everything else (and document fallback) -> OpenAI.
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return j({ error: 'OPENAI_API_KEY secret is not set on this function' }, 500);

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: task === 'document' ? 0.4 : 0.6,
        messages: [
          { role: 'system', content: task === 'document' ? docSystem : chatSystem },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return j({ error: `OpenAI error ${resp.status}`, detail: t.slice(0, 500) }, 502);
    }
    const data = await resp.json();
    const reply = data?.choices?.[0]?.message?.content ?? '';
    return j({ reply, model_used: OPENAI_MODEL });
  } catch (e) {
    return j({ error: `OpenAI call failed: ${String(e)}` }, 502);
  }
});
