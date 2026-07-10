import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Social post caption generator for the BaMo RE Assistant app.
 *
 * Ports the Ads Manager /api/posts/generate prompt logic (goals, tones,
 * English/Taglish/Tagalog) so mobile-generated content behaves the same and
 * stays traceable: every generation is saved to ad_content, where the web
 * Ads Manager's "Pull from Content" already reads.
 *
 * Anthropic claude-opus-4-8 when ANTHROPIC_API_KEY is set, else OpenAI gpt-4o.
 * JWT-verified (verify_jwt=true). Keys never ship in the app.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OPENAI_MODEL = 'gpt-4o';
const ANTHROPIC_MODEL = 'claude-opus-4-8';

const GOALS: Record<string, { instruction: string; adjectives: string }> = {
  listing_promotion: {
    instruction: 'Drive interest in this specific property. Highlight 2-3 standout features. End with a clear CTA to inquire or view.',
    adjectives: 'aspirational, polished, confident, evocative',
  },
  open_house: {
    instruction: 'Invite the reader to a specific open house. Include date/time placeholder if not provided. CTA is to RSVP or attend.',
    adjectives: 'urgent, welcoming, time-sensitive, inviting',
  },
  tripping_invite: {
    instruction: 'Invite the reader to a site visit (tripping). Emphasize seeing the property in person. CTA is to book a tripping schedule.',
    adjectives: 'experiential, sensory, persuasive, action-oriented',
  },
  event_promotion: {
    instruction: 'Promote an event (seminar, launch, expo). Focus on what attendees gain. CTA is to register or attend.',
    adjectives: 'energetic, professional, anticipation-building',
  },
  brand_awareness: {
    instruction: 'No direct sales ask. Build top-of-mind recognition for the agent/brand. Share value or perspective.',
    adjectives: 'thoughtful, authoritative, value-driven',
  },
  lead_magnet: {
    instruction: 'Offer a free resource (guide, computation, checklist). CTA is to message/comment to receive it.',
    adjectives: 'helpful, generous, no-pressure, useful',
  },
  social_proof: {
    instruction: 'Build trust through testimonial or success story framing. CTA is soft — invite the reader to imagine themselves in the same outcome.',
    adjectives: 'credible, warm, story-driven, relatable',
  },
  lifestyle: {
    instruction: 'Community-building or relatable content. No sales ask. Encourage comments and engagement.',
    adjectives: 'warm, relatable, conversational, human',
  },
  real_estate_info: {
    instruction: 'Educate the reader on one Philippine real-estate topic (e.g. Pag-IBIG loan process, who pays Capital Gains Tax, buying steps, selling tips). Accurate, practical, easy to digest. CTA is to message with questions.',
    adjectives: 'clear, trustworthy, helpful, expert-but-simple',
  },
};

const TONES: Record<string, string> = {
  professional: 'Polished, trustworthy, broker-grade professional English.',
  friendly: 'Warm, approachable, conversational. Like a helpful kapitbahay who knows real estate.',
  urgent: 'Energetic and time-sensitive. Push action without being spammy.',
  luxury: 'Elegant, understated, aspirational. Fewer words, more weight.',
};

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  english: 'Write in natural, professional English suited to Philippine real estate marketing.',
  taglish: 'Write in conversational Taglish — natural code-switching between Filipino and English the way real estate agents actually post on Facebook in the Philippines. Not forced or mechanical alternation sentence-by-sentence.',
  tagalog: 'Sumulat sa natural na conversational Filipino — hindi pormal o parang textbook; everyday spoken register.',
};

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

  // verify_jwt=true already validated the token; decode its `sub` directly.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  let uid = '';
  try {
    uid = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub ?? '';
  } catch { /* invalid token shape */ }
  if (!uid) return j({ error: 'Not authenticated' }, 401);

  let payload: {
    goal?: string;
    tone?: string;
    language?: string;
    listing_id?: string | null;
    instructions?: string | null;
  };
  try {
    payload = await req.json();
  } catch {
    return j({ error: 'Invalid JSON body' }, 400);
  }

  const goal = payload.goal && GOALS[payload.goal] ? payload.goal : null;
  if (!goal) {
    return j({ error: `goal is required. Valid values: ${Object.keys(GOALS).join(', ')}` }, 400);
  }
  const goalEntry = GOALS[goal];
  const tone = payload.tone && TONES[payload.tone] ? payload.tone : 'friendly';
  const langInstruction = LANGUAGE_INSTRUCTIONS[payload.language ?? ''] ?? LANGUAGE_INSTRUCTIONS.english;

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, client_id, full_name')
    .eq('id', uid)
    .maybeSingle();
  if (!profile?.client_id) return j({ error: 'Your workspace is not linked yet.' }, 403);
  const clientId = profile.client_id;

  // Freemium AI cap: content generation counts against the monthly quota.
  // Fail-open so an infra hiccup never blocks the app.
  try {
    const { data: credit, error: creditErr } = await admin.rpc('consume_ai_credit', {
      p_client_id: clientId,
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

  const { data: client } = await admin
    .from('clients')
    .select('name, company_name')
    .eq('id', clientId)
    .maybeSingle();

  // Listing context — the agent's own in-app listings (agent_listings, not the
  // web ad_listings marketplace snapshot).
  let listing: Record<string, unknown> | null = null;
  if (payload.listing_id) {
    const { data } = await admin
      .from('agent_listings')
      .select('id, client_id, title, property_type, listing_type, price, location, city, bedrooms, bathrooms, floor_area, lot_area, description')
      .eq('id', payload.listing_id)
      .maybeSingle();
    if (!data) return j({ error: 'Listing not found' }, 404);
    if (data.client_id !== clientId) return j({ error: 'Forbidden' }, 403);
    listing = data;
  }

  const listingBlock = listing
    ? `
PROPERTY DETAILS (use the real numbers, do not invent any):
- Name: ${listing.title ?? 'N/A'}
- Type: ${listing.property_type ?? 'N/A'} (for ${listing.listing_type === 'rent' ? 'rent' : 'sale'})
- Price: ${listing.price ? `PHP ${Number(listing.price).toLocaleString('en-PH')}` : 'Price upon inquiry'}
- Location: ${[listing.location, listing.city].filter(Boolean).join(', ') || 'N/A'}
- Bedrooms: ${listing.bedrooms ?? 'N/A'} | Bathrooms: ${listing.bathrooms ?? 'N/A'}
- Floor area: ${listing.floor_area ? `${listing.floor_area} sqm` : 'N/A'} | Lot area: ${listing.lot_area ? `${listing.lot_area} sqm` : 'N/A'}
- Description: ${listing.description ?? 'N/A'}`
    : 'No specific property attached — write at the brand level.';

  const brand = client?.name ?? profile.full_name ?? 'the agent';
  const prompt = `You are the social media copywriter for "${brand}"${client?.company_name ? ` (${client.company_name})` : ''}, a Philippine real estate brand. Write one organic facebook post.
${payload.instructions?.trim() ? `\nADDITIONAL INSTRUCTIONS FROM THE CLIENT: ${payload.instructions.trim()}` : ''}
${listingBlock}

GOAL: ${goalEntry.instruction}
STYLE: Use language that feels ${goalEntry.adjectives}. The factual content comes from the inputs above — these adjectives describe the register, not new facts.
TONE: ${TONES[tone]}
LANGUAGE: ${langInstruction}

RULES:
- Philippine market context: prices in PHP, local geography, Pag-IBIG/bank financing references only if relevant.
- Never invent prices, sizes, or features not given above.
- Caption length: 60-150 words.
- 5-8 hashtags, mixing brand, location, and category tags.
- No emojis in the hook; caption may use 2-4 emojis naturally placed.

Respond with ONLY a JSON object, no markdown fences, in exactly this shape:
{"title": "short internal label for this content", "hook": "first line that stops the scroll", "caption": "the full post caption including the hook as its first line", "hashtags": ["#tag1", "#tag2"], "cta": "the closing call to action used"}`;

  // Call the AI provider — Anthropic preferred, OpenAI fallback.
  let raw = '';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
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
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        raw = (data.content ?? []).find((b: { type: string }) => b.type === 'text')?.text ?? '';
      }
    } catch { /* fall through to OpenAI */ }
  }
  if (!raw) {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) return j({ error: 'No AI provider key configured' }, 500);
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return j({ error: `AI generation failed (${resp.status})`, detail: t.slice(0, 300) }, 502);
    }
    const data = await resp.json();
    raw = data?.choices?.[0]?.message?.content ?? '';
  }

  let parsed: { title?: string; hook?: string; caption?: string; hashtags?: string[]; cta?: string };
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return j({ error: 'AI returned unparseable output — try again' }, 502);
  }
  if (!parsed.caption) return j({ error: 'AI returned no caption — try again' }, 502);

  // Persist to ad_content for traceability + reuse in the web Ads Manager.
  const { data: content, error: insertErr } = await admin
    .from('ad_content')
    .insert({
      client_id: clientId,
      title: parsed.title ?? `AI: ${goal} (${new Date().toISOString().slice(0, 10)})`,
      platform: 'facebook',
      tone,
      caption: parsed.caption,
      hook: parsed.hook ?? null,
      hashtags: parsed.hashtags ?? [],
      cta: parsed.cta ?? null,
      ai_generated: true,
      listing_id: listing ? String(listing.id) : null,
      status: 'approved',
      created_by: profile.id,
    })
    .select('id')
    .single();
  if (insertErr) return j({ error: insertErr.message }, 500);

  return j({
    content_id: content.id,
    title: parsed.title ?? null,
    hook: parsed.hook ?? null,
    caption: parsed.caption,
    hashtags: parsed.hashtags ?? [],
    cta: parsed.cta ?? null,
  });
});
