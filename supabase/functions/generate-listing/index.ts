/**
 * AI Listing Generator for the BaMo RE Assistant.
 *
 * Takes the agent's rough notes + any structured fields and returns a clean,
 * structured listing as JSON (title, normalized fields, marketing description).
 *
 * Document/content generation -> Anthropic claude-opus-4-8 when ANTHROPIC_API_KEY
 * is set, otherwise OpenAI gpt-4o. JWT-verified. Keys never ship in the app.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OPENAI_MODEL = 'gpt-4o';
const ANTHROPIC_MODEL = 'claude-opus-4-8';

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return j({ error: 'POST only' }, 405);

  // Require a valid JWT (verify_jwt=true already validated it).
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  let uid = '';
  try {
    uid = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub ?? '';
  } catch { /* invalid token */ }
  if (!uid) return j({ error: 'Not authenticated' }, 401);

  let payload: { details?: string; fields?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return j({ error: 'Invalid JSON body' }, 400);
  }

  const details = (payload.details ?? '').toString().trim();
  const fields = payload.fields ?? {};
  if (!details && Object.keys(fields).length === 0) {
    return j({ error: 'Provide some property details to generate a listing.' }, 400);
  }

  // Freemium AI cap: listing generation counts against the monthly quota. Resolve
  // the caller's workspace, then spend a credit. Fail-open on any infra error.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: profile } = await admin
    .from('profiles')
    .select('client_id')
    .eq('id', uid)
    .maybeSingle();
  if (profile?.client_id) {
    try {
      const { data: credit, error: creditErr } = await admin.rpc('consume_ai_credit', {
        p_client_id: profile.client_id,
      });
      if (!creditErr && credit && credit.allowed === false) {
        return j(
          { error: 'AI limit reached', code: 'ai_limit_reached', used: credit.used, limit: credit.limit },
          402,
        );
      }
    } catch {
      /* fail-open */
    }
  }

  const system =
    `You write real estate listings for a Philippine agent using the BaMo app. ` +
    `You are given the agent's rough notes and any structured fields they already entered. ` +
    `Return ONLY a JSON object (no markdown, no prose) with exactly these keys:\n` +
    `title (string, short & catchy), property_type (string e.g. "House & Lot", "Condo", ` +
    `"Townhouse", "Lot", "Commercial"), listing_type ("sale" or "rent"), price (number or null), ` +
    `lot_area (number sqm or null), floor_area (number sqm or null), bedrooms (integer or null), ` +
    `bathrooms (integer or null), location (string or ""), city (string or ""), ` +
    `description (string: warm, professional 2-4 sentence marketing description, mostly English, ` +
    `PH real-estate tone).\n` +
    `RULES: Use the agent's provided fields/notes as the source of truth. NEVER invent a price, ` +
    `size, or location that was not provided — use null/"" instead. Do not add facts not implied ` +
    `by the input. Keep the description honest and appealing.`;

  const userMsg =
    `STRUCTURED FIELDS (may be partial):\n${JSON.stringify(fields)}\n\n` +
    `AGENT NOTES:\n${details || '(none)'}`;

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

  // Prefer Anthropic for this content-generation task when available.
  if (anthropicKey) {
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
          max_tokens: 1500,
          system,
          messages: [{ role: 'user', content: userMsg }],
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const raw = (data.content ?? []).find((b: { type: string }) => b.type === 'text')?.text ?? '{}';
        return j({ listing: JSON.parse(stripFences(raw)), model_used: ANTHROPIC_MODEL });
      }
      // fall through to OpenAI on Anthropic error
    } catch { /* fall through */ }
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return j({ error: 'OPENAI_API_KEY secret is not set' }, 500);

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return j({ error: `OpenAI error ${resp.status}`, detail: t.slice(0, 500) }, 502);
    }
    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content ?? '{}';
    return j({ listing: JSON.parse(stripFences(raw)), model_used: OPENAI_MODEL });
  } catch (e) {
    return j({ error: `Generation failed: ${String(e)}` }, 502);
  }
});
