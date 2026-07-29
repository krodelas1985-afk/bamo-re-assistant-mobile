import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * BayMo assistant chat proxy — v2, agentic.
 *
 * - General chat  -> OpenAI gpt-4o with a TOOL LOOP: BayMo can search the
 *   caller's own leads, read a conversation, check appointments/tasks/stats,
 *   create reminders, and PROPOSE a campaign enrollment. Enrollment never
 *   executes from the model: the tool only returns a `pending_action` that the
 *   app renders as a Confirm/Cancel card; tapping Confirm calls back with
 *   `action: 'execute_enroll'`, which runs the enroll_lead() RPC directly
 *   (no model in that path).
 * - Document mode -> Anthropic claude-opus-4-8 when ANTHROPIC_API_KEY is set,
 *   otherwise falls back to OpenAI (unchanged from v1).
 *
 * JWT-verified (verify_jwt=true). All tool reads/writes use the service-role
 * client but are scoped in code to the caller's client_id — and, for the
 * 'agent' role, to their own assigned leads / own-created rows — mirroring the
 * RLS the mobile app sees (leads_select, appointments_select, tasks_select).
 * Keys never ship in the mobile app.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OPENAI_MODEL = 'gpt-4o';
const ANTHROPIC_MODEL = 'claude-opus-4-8';
const MAX_TOOL_ROUNDS = 6;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

/** What the app renders as a Confirm/Cancel card. */
type PendingAction = {
  type: 'enroll_campaign';
  lead_id: string;
  lead_name: string;
  campaign_id: string;
  campaign_name: string;
  /** Extra caution shown on the card (e.g. lead has no Messenger link). */
  warning: string | null;
};

type Ctx = {
  admin: SupabaseClient;
  uid: string;
  role: string | null;
  clientId: string | null;
};

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** Today's date in Manila (YYYY-MM-DD) — the model needs it for "bukas"/"sa Lunes". */
function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

// ── Lead scoping ─────────────────────────────────────────────────────────────
// Mirrors leads_select RLS: everyone is fenced to their client; agents only see
// leads assigned to them. Every tool goes through this.

function scopedLeads(ctx: Ctx, columns: string) {
  let q = ctx.admin.from('leads').select(columns).eq('client_id', ctx.clientId!);
  if (ctx.role === 'agent') q = q.eq('assigned_user_id', ctx.uid);
  return q;
}

function scopedLeadCount(ctx: Ctx) {
  let q = ctx.admin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', ctx.clientId!);
  if (ctx.role === 'agent') q = q.eq('assigned_user_id', ctx.uid);
  return q;
}

/** Fetch one lead the caller is allowed to see, or null. */
async function fetchScopedLead(ctx: Ctx, leadId: string, columns = 'id, name, messenger_id') {
  const { data } = await scopedLeads(ctx, columns).eq('id', leadId).maybeSingle();
  return data as Record<string, unknown> | null;
}

// ── Tool executors ───────────────────────────────────────────────────────────
// Each returns a plain object serialized into the tool result. Errors are
// returned as { error } strings so the model can explain them, never thrown.

const LEAD_LIST_COLS =
  'id, name, lead_temperature, status, source, phone, email, last_message_at, created_at, conversation_summary';

async function toolSearchLeads(ctx: Ctx, args: Record<string, unknown>) {
  const limit = Math.min(Number(args.limit) || 8, 20);
  let q = scopedLeads(ctx, LEAD_LIST_COLS)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (typeof args.query === 'string' && args.query.trim())
    q = q.ilike('name', `%${args.query.trim()}%`);
  if (typeof args.temperature === 'string' && args.temperature)
    q = q.eq('lead_temperature', args.temperature);
  if (typeof args.status === 'string' && args.status) q = q.eq('status', args.status);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { count: (data ?? []).length, leads: data ?? [] };
}

async function toolGetLeadDetails(ctx: Ctx, args: Record<string, unknown>) {
  const leadId = String(args.lead_id ?? '');
  const { data, error } = await scopedLeads(
    ctx,
    LEAD_LIST_COLS +
      ', lead_type, current_location, timeframe, motivation, lead_score, automation_enabled, campaign_id, ' +
      'lead_qualifications(budget_min, budget_max, property_type, property_sub_type, bedrooms, preferred_location, payment_scheme, preferred_financing, move_in_date, purpose)',
  )
    .eq('id', leadId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'Lead not found (or not assigned to this user).' };
  return { lead: data };
}

async function toolGetConversation(ctx: Ctx, args: Record<string, unknown>) {
  const leadId = String(args.lead_id ?? '');
  const limit = Math.min(Number(args.limit) || 15, 40);
  const lead = await fetchScopedLead(ctx, leadId, 'id, name');
  if (!lead) return { error: 'Lead not found (or not assigned to this user).' };
  const { data, error } = await ctx.admin
    .from('conversations')
    .select('direction, sender, sent_via, message_content, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { error: error.message };
  // Same sender attribution the app uses: ai/sequence/system → BaMo.
  const messages = (data ?? []).reverse().map((r) => {
    const s = (r.sender ?? '').toLowerCase();
    const from =
      s === 'ai' || s === 'sequence' || s === 'system' || r.sent_via === 'baymo'
        ? 'BaMo AI'
        : s === 'agent'
          ? 'Agent'
          : s === 'lead'
            ? 'Lead'
            : r.direction === 'outbound'
              ? 'Agent'
              : 'Lead';
    return { from, text: r.message_content ?? '', at: r.created_at };
  });
  return { lead_name: lead.name, messages };
}

async function toolGetAppointments(ctx: Ctx, args: Record<string, unknown>) {
  const daysAhead = Math.min(Number(args.days_ahead) || 7, 60);
  const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + daysAhead * 864e5).toISOString();
  // Mirrors appointments_select RLS: client fence; agents only see their own.
  let q = ctx.admin
    .from('appointments')
    .select('id, lead_id, title, contact_name, appointment_type, scheduled_at, location, notes, status')
    .eq('client_id', ctx.clientId!)
    .eq('status', 'scheduled')
    .gte('scheduled_at', from)
    .lte('scheduled_at', to)
    .order('scheduled_at', { ascending: true })
    .limit(30);
  if (ctx.role === 'agent') q = q.eq('created_by', ctx.uid);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { count: (data ?? []).length, appointments: data ?? [] };
}

async function toolGetTasks(ctx: Ctx) {
  // Mirrors tasks_select RLS (minus the lead-assignment arm — assigned_to /
  // created_by covers both BayMo reminders and the agent's own tasks).
  let q = ctx.admin
    .from('tasks')
    .select('id, title, notes, status, due_date, task_type, source, lead_id')
    .eq('client_id', ctx.clientId!)
    .in('status', ['pending', 'deferred'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(30);
  if (ctx.role === 'agent') q = q.or(`assigned_to.eq.${ctx.uid},created_by.eq.${ctx.uid}`);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { count: (data ?? []).length, tasks: data ?? [], today_manila: manilaToday() };
}

async function toolPipelineStats(ctx: Ctx) {
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const [total, hot, warm, newWeek] = await Promise.all([
    scopedLeadCount(ctx),
    scopedLeadCount(ctx).eq('lead_temperature', 'Hot'),
    scopedLeadCount(ctx).eq('lead_temperature', 'Warm'),
    scopedLeadCount(ctx).gte('created_at', weekAgo),
  ]);
  return {
    total_leads: total.count ?? 0,
    hot: hot.count ?? 0,
    warm_ready: warm.count ?? 0,
    new_this_week: newWeek.count ?? 0,
  };
}

async function toolListCampaigns(ctx: Ctx) {
  const { data, error } = await ctx.admin
    .from('campaigns')
    .select('id, name, channel, target_action')
    .eq('client_id', ctx.clientId!)
    .eq('status', 'active')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) return { error: error.message };
  return { count: (data ?? []).length, campaigns: data ?? [] };
}

/**
 * Validate an enrollment and build the PendingAction — does NOT enroll.
 * Shared by the propose tool and the execute endpoint so both re-check the
 * same scoping (the execute call arrives later and rows may have changed).
 */
async function validateEnrollment(
  ctx: Ctx,
  leadId: string,
  campaignId: string,
): Promise<{ pending?: PendingAction; error?: string }> {
  if (!ctx.clientId) return { error: 'No client workspace on this account.' };
  const lead = await fetchScopedLead(ctx, leadId, 'id, name, messenger_id, campaign_id');
  if (!lead) return { error: 'Lead not found (or not assigned to this user).' };
  const { data: campaign } = await ctx.admin
    .from('campaigns')
    .select('id, name, channel, status, is_active')
    .eq('id', campaignId)
    .eq('client_id', ctx.clientId)
    .maybeSingle();
  if (!campaign) return { error: 'Campaign not found for this client.' };
  if (campaign.status !== 'active' || campaign.is_active !== true)
    return { error: `Campaign "${campaign.name}" is not active.` };

  const { data: state } = await ctx.admin
    .from('lead_campaign_states')
    .select('state')
    .eq('lead_id', leadId)
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (state?.state === 'active')
    return { error: `${lead.name} is already actively enrolled in "${campaign.name}".` };

  return {
    pending: {
      type: 'enroll_campaign',
      lead_id: String(lead.id),
      lead_name: String(lead.name ?? 'Lead'),
      campaign_id: String(campaign.id),
      campaign_name: String(campaign.name ?? 'Campaign'),
      warning: lead.messenger_id
        ? null
        : 'This lead has no Messenger link — automated messages may not reach them.',
    },
  };
}

async function toolCreateReminder(ctx: Ctx, args: Record<string, unknown>) {
  const title = String(args.title ?? '').trim();
  if (!title) return { error: 'title is required.' };
  const dueDate =
    typeof args.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.due_date)
      ? args.due_date
      : null;
  let leadId: string | null = null;
  if (typeof args.lead_id === 'string' && args.lead_id) {
    const lead = await fetchScopedLead(ctx, args.lead_id, 'id');
    if (!lead) return { error: 'Lead not found (or not assigned to this user).' };
    leadId = args.lead_id;
  }
  const { data, error } = await ctx.admin
    .from('tasks')
    .insert({
      client_id: ctx.clientId,
      lead_id: leadId,
      title,
      notes: typeof args.notes === 'string' && args.notes.trim() ? args.notes.trim() : null,
      due_date: dueDate,
      status: 'pending',
      // Chip on the Tasks screen reads non-'manual' sources as "🤖 BaMo".
      source: 'baymo',
      triggered_by: 'baymo',
      task_type: leadId ? 'follow_up' : 'general',
      assigned_to: ctx.uid,
      created_by: ctx.uid,
    })
    .select('id, title, due_date')
    .single();
  if (error) return { error: error.message };
  return { created: true, task: data, note: 'Reminder saved — it appears in the Tasks screen.' };
}

// ── OpenAI tool schemas ──────────────────────────────────────────────────────

const OPENAI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_leads',
      description:
        "Search the agent's own leads by name and/or filters. Always use this to resolve a lead the user mentions by name before any other lead tool.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Partial name to match (optional).' },
          temperature: { type: 'string', enum: ['New', 'Hot', 'Warm', 'Cold'] },
          status: {
            type: 'string',
            enum: [
              'New',
              'In Contact',
              'Qualifying',
              'Qualified',
              'Viewing',
              'Negotiating',
              'Nurture',
              'Won',
              'Lost',
            ],
          },
          limit: { type: 'number', description: 'Max results, default 8, max 20.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_lead_details',
      description: 'Full profile + qualification (budget, location, timeline) for one lead.',
      parameters: {
        type: 'object',
        properties: { lead_id: { type: 'string' } },
        required: ['lead_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_conversation',
      description: 'Recent Messenger conversation transcript for one lead (oldest first).',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'string' },
          limit: { type: 'number', description: 'Messages to fetch, default 15, max 40.' },
        },
        required: ['lead_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_appointments',
      description: "The agent's upcoming scheduled appointments (viewings, calls, events).",
      parameters: {
        type: 'object',
        properties: { days_ahead: { type: 'number', description: 'Window in days, default 7.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_tasks',
      description: "The agent's open tasks and reminders (pending + deferred).",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pipeline_stats',
      description: 'Lead counts: total, hot, warm/ready, new this week.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_campaigns',
      description: 'Active follow-up campaigns the client can enroll leads into.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_enrollment',
      description:
        'Propose enrolling a lead into a campaign. This does NOT enroll — it shows the user a Confirm card in the app. Use ONLY after resolving both the lead (search_leads) and the campaign (list_campaigns).',
      parameters: {
        type: 'object',
        properties: { lead_id: { type: 'string' }, campaign_id: { type: 'string' } },
        required: ['lead_id', 'campaign_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_reminder',
      description:
        'Create a reminder/task for the agent. Executes immediately (no confirm card). Dates are Asia/Manila.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Short imperative title, e.g. "Call Maria about viewing".',
          },
          due_date: { type: 'string', description: 'YYYY-MM-DD (Manila). Omit for "anytime".' },
          lead_id: {
            type: 'string',
            description: 'Attach to a lead (optional; resolve via search_leads first).',
          },
          notes: { type: 'string' },
        },
        required: ['title'],
      },
    },
  },
];

async function runTool(
  ctx: Ctx,
  name: string,
  args: Record<string, unknown>,
): Promise<{ result: unknown; pending?: PendingAction }> {
  if (!ctx.clientId)
    return { result: { error: 'No client workspace on this account yet — no data to read.' } };
  switch (name) {
    case 'search_leads':
      return { result: await toolSearchLeads(ctx, args) };
    case 'get_lead_details':
      return { result: await toolGetLeadDetails(ctx, args) };
    case 'get_conversation':
      return { result: await toolGetConversation(ctx, args) };
    case 'get_appointments':
      return { result: await toolGetAppointments(ctx, args) };
    case 'get_tasks':
      return { result: await toolGetTasks(ctx) };
    case 'get_pipeline_stats':
      return { result: await toolPipelineStats(ctx) };
    case 'list_campaigns':
      return { result: await toolListCampaigns(ctx) };
    case 'create_reminder':
      return { result: await toolCreateReminder(ctx, args) };
    case 'propose_enrollment': {
      const v = await validateEnrollment(
        ctx,
        String(args.lead_id ?? ''),
        String(args.campaign_id ?? ''),
      );
      if (v.error) return { result: { error: v.error } };
      return {
        result: {
          proposed: true,
          note:
            'A Confirm card is now showing in the app. Tell the user to tap Confirm to enroll ' +
            `${v.pending!.lead_name} in "${v.pending!.campaign_name}" — do NOT say it is done yet.` +
            (v.pending!.warning ? ` Warning to mention: ${v.pending!.warning}` : ''),
        },
        pending: v.pending,
      };
    }
    default:
      return { result: { error: `Unknown tool ${name}` } };
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return j({ error: 'POST only' }, 405);

  let payload: {
    messages?: ChatMessage[];
    task?: 'chat' | 'document';
    document_type?: string;
    action?: 'execute_enroll';
    lead_id?: string;
    campaign_id?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return j({ error: 'Invalid JSON body' }, 400);
  }

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

  // Service-role client; every read/write below is scoped by the caller's profile.
  const admin = createClient(supabaseUrl, JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default']);

  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, role, client_id')
    .eq('id', uid)
    .maybeSingle();

  const agentName = (profile?.full_name ?? '').split(/\s+/)[0] || 'there';
  const ctx: Ctx = {
    admin,
    uid,
    role: profile?.role ?? null,
    clientId: profile?.client_id ?? null,
  };

  // ── Execute path: user tapped Confirm on an enrollment card ──────────────
  // Model-free by design: the app calls this directly with the pending payload.
  if (payload.action === 'execute_enroll') {
    if (!payload.lead_id || !payload.campaign_id)
      return j({ error: 'lead_id and campaign_id are required' }, 400);
    const v = await validateEnrollment(ctx, payload.lead_id, payload.campaign_id);
    if (v.error) return j({ ok: false, error: v.error });
    const { data, error } = await admin.rpc('enroll_lead', {
      p_lead_id: payload.lead_id,
      p_is_new: false,
      p_campaign_id: payload.campaign_id,
      p_force: true, // manual path: explicit user confirmation just happened
    });
    if (error) return j({ ok: false, error: error.message });
    const r = data as { enrolled?: boolean; campaign_name?: string; reason?: string } | null;
    if (!r?.enrolled)
      return j({ ok: false, error: `Enrollment failed (${r?.reason ?? 'unknown'})` });
    return j({
      ok: true,
      message: `${v.pending!.lead_name} is now enrolled in "${r.campaign_name ?? v.pending!.campaign_name}". BaMo will handle the follow-ups from here. 🎉`,
    });
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const task = payload.task === 'document' ? 'document' : 'chat';
  if (messages.length === 0) return j({ error: 'messages is required' }, 400);

  const chatSystem =
    `You are BayMo, the friendly AI assistant inside the BaMo real estate app for Philippine ` +
    `agents, brokers, and developers. You are talking to ${agentName}. Today is ${manilaToday()} ` +
    `(Asia/Manila). Speak warm, encouraging Taglish (natural Filipino-English mix), concise and ` +
    `mobile-friendly.\n\n` +
    `You have TOOLS over ${agentName}'s real pipeline. Rules:\n` +
    `- Use tools for ANY question about their leads, numbers, schedule, or tasks. NEVER invent ` +
    `leads, names, or figures; if a tool returns nothing, say so.\n` +
    `- When the user names a lead, resolve it with search_leads first. If several match, list ` +
    `them briefly and ask which one.\n` +
    `- Enrollment: list_campaigns → propose_enrollment. The proposal only shows a Confirm card; ` +
    `NEVER claim a lead was enrolled — the user must tap Confirm.\n` +
    `- Reminders: you have NO memory outside tools. If the user asks to be reminded of anything, ` +
    `you MUST call create_reminder in this turn — replying "I'll remind you" without the tool ` +
    `call is a false promise. After the tool succeeds, confirm the exact title + date it saved.\n` +
    `- Do not repeat raw IDs/UUIDs to the user; use names.\n` +
    `- You cannot send messages to leads yet. If asked, say that's coming soon and offer a ` +
    `reminder or campaign enrollment instead.`;

  const docSystem =
    `You are BayMo, drafting a professional Philippine real estate document` +
    (payload.document_type ? ` (${payload.document_type})` : '') +
    ` for the agent ${agentName}. Produce a clean, ready-to-edit draft using standard PH real ` +
    `estate conventions (PHP amounts, Pag-IBIG/bank financing where relevant). Use clearly marked ` +
    `[BRACKETED] placeholders for any detail the agent must fill in (names, TCT numbers, dates, ` +
    `amounts). Do not invent specific facts. Return only the document text.`;

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

  // Document mode -> Anthropic when available (unchanged from v1).
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

  // Chat (and document fallback) -> OpenAI. Chat runs the tool loop.
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return j({ error: 'OPENAI_API_KEY secret is not set on this function' }, 500);

  // deno-lint-ignore no-explicit-any
  const convo: any[] = [
    { role: 'system', content: task === 'document' ? docSystem : chatSystem },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  let pendingAction: PendingAction | null = null;

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const lastRound = round === MAX_TOOL_ROUNDS;
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          temperature: task === 'document' ? 0.4 : 0.6,
          messages: convo,
          // Documents never need tools; the last round forces a final text answer.
          ...(task === 'chat' && !lastRound ? { tools: OPENAI_TOOLS } : {}),
        }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        return j({ error: `OpenAI error ${resp.status}`, detail: t.slice(0, 500) }, 502);
      }
      const data = await resp.json();
      const msg = data?.choices?.[0]?.message;
      const toolCalls = msg?.tool_calls as
        | { id: string; function: { name: string; arguments: string } }[]
        | undefined;

      if (!toolCalls?.length) {
        return j({
          reply: msg?.content ?? '',
          model_used: OPENAI_MODEL,
          ...(pendingAction ? { pending_action: pendingAction } : {}),
        });
      }

      convo.push(msg);
      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          // leave args empty; the tool will report what's missing
        }
        const { result, pending } = await runTool(ctx, call.function.name, args);
        if (pending) pendingAction = pending; // one card per reply; last proposal wins
        convo.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }
    // Loop exhausted without a text reply (should not happen — final round has no tools).
    return j({ error: 'BayMo took too many steps — please try again.' }, 502);
  } catch (e) {
    return j({ error: `OpenAI call failed: ${String(e)}` }, 502);
  }
});
