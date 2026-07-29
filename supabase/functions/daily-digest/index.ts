import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Daily digest generator — runs at 6:15 AM Manila (pg_cron 22:15 UTC) and, for
 * every client, summarizes YESTERDAY (Manila) into a daily_digests row:
 *   metrics: { new_leads, baymo_handled, turned_warm, turned_hot, automation_active }
 *   suggestions: up to 5 takeover candidates [{lead_id, name, temperature,
 *                assigned_user_id, reason}] — only when automation is active.
 * For each suggestion it also creates a source='baymo' task_type='takeover'
 * task (due today, assigned to the lead's agent) unless one is already pending,
 * and drops an in-app 'daily_digest' notification per client member (push-
 * dispatch treats unknown types as in-app only, so no push policy needed yet).
 *
 * When the client has NO active campaign, there are no suggestions/tasks; the
 * digest instead carries automation_active=false so the app can show
 * "BaMo automation is off — activate a campaign" (per Kathy, 2026-07-11).
 *
 * Auth: pg_cron (via pg_net) sends x-digest-secret, validated against the same
 * Vault secret push-dispatch uses (check_push_dispatch_secret RPC) — the caller
 * is the same trusted cron. verify_jwt=false; nothing runs without the secret.
 * Manual test runs may POST { date?: 'YYYY-MM-DD', client_id?: uuid, dry_run?: true }.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-digest-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** YYYY-MM-DD for "now minus n days" in Asia/Manila. */
function manilaDate(minusDays = 0): string {
  return new Date(Date.now() - minusDays * 864e5).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Manila',
  });
}

type Suggestion = {
  lead_id: string;
  name: string;
  temperature: string;
  assigned_user_id: string | null;
  reason: string;
};

async function digestForClient(
  db: SupabaseClient,
  clientId: string,
  activityDate: string, // the Manila day being summarized (usually yesterday)
  dryRun: boolean,
) {
  const start = `${activityDate}T00:00:00+08:00`;
  const end = new Date(new Date(start).getTime() + 864e5).toISOString();

  const [newLeadsRes, convRes, tempRes, campRes] = await Promise.all([
    db.from('leads').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).gte('created_at', start).lt('created_at', end),
    db.from('conversations').select('lead_id')
      .eq('client_id', clientId).gte('created_at', start).lt('created_at', end)
      .or('sender.in.(ai,sequence,system),sent_via.eq.baymo').limit(2000),
    db.from('lead_temperature_events').select('to_temperature')
      .eq('client_id', clientId).gte('changed_at', start).lt('changed_at', end)
      .in('to_temperature', ['Warm', 'Hot']).limit(2000),
    db.from('campaigns').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('status', 'active').eq('is_active', true),
  ]);

  const handled = new Set(
    ((convRes.data as { lead_id: string | null }[]) ?? []).map((r) => r.lead_id).filter(Boolean),
  );
  const temps = (tempRes.data as { to_temperature: string }[]) ?? [];
  const automationActive = (campRes.count ?? 0) > 0;

  const metrics = {
    new_leads: newLeadsRes.count ?? 0,
    baymo_handled: handled.size,
    turned_warm: temps.filter((t) => t.to_temperature === 'Warm').length,
    turned_hot: temps.filter((t) => t.to_temperature === 'Hot').length,
    automation_active: automationActive,
  };

  // Takeover suggestions: hot/warm leads whose last inbound (last 48h) is
  // newer than the agent's last contact. Only meaningful while BaMo automation
  // is live — when it's off, the digest's job is the activation nudge instead.
  let suggestions: Suggestion[] = [];
  if (automationActive) {
    const twoDaysAgo = new Date(Date.now() - 2 * 864e5).toISOString();
    const { data: cands } = await db
      .from('leads')
      .select('id, name, lead_temperature, assigned_user_id, last_inbound_at, last_contacted_at')
      .eq('client_id', clientId)
      .in('lead_temperature', ['Hot', 'Warm'])
      .gte('last_inbound_at', twoDaysAgo)
      .order('last_inbound_at', { ascending: false })
      .limit(20);
    suggestions = ((cands as Record<string, string | null>[]) ?? [])
      .filter((l) => !l.last_contacted_at || l.last_contacted_at! < l.last_inbound_at!)
      .slice(0, 5)
      .map((l) => ({
        lead_id: l.id!,
        name: l.name ?? 'Lead',
        temperature: l.lead_temperature ?? 'Warm',
        assigned_user_id: l.assigned_user_id,
        reason: 'Replied recently and is waiting to hear from you',
      }));
  }

  if (dryRun) return { client_id: clientId, metrics, suggestions, dry_run: true };

  // Digest row (idempotent per client+date).
  const { error: upErr } = await db.from('daily_digests').upsert(
    { client_id: clientId, digest_date: activityDate, metrics, suggestions },
    { onConflict: 'client_id,digest_date' },
  );
  if (upErr) return { client_id: clientId, error: upErr.message };

  // Takeover tasks — skip leads that already have a pending takeover task.
  let tasksCreated = 0;
  for (const s of suggestions) {
    const { data: existing } = await db
      .from('tasks').select('id')
      .eq('lead_id', s.lead_id).eq('task_type', 'takeover').eq('status', 'pending')
      .limit(1).maybeSingle();
    if (existing) continue;
    const { error } = await db.from('tasks').insert({
      client_id: clientId,
      lead_id: s.lead_id,
      title: `Take over: ${s.name} (${s.temperature})`,
      notes: s.reason,
      due_date: manilaDate(0),
      status: 'pending',
      source: 'baymo',
      triggered_by: 'baymo',
      task_type: 'takeover',
      assigned_to: s.assigned_user_id,
    });
    if (!error) tasksCreated++;
  }

  // In-app notification per member — only when there is something to say, and
  // never twice for the same digest date.
  let notified = 0;
  if (metrics.new_leads > 0 || metrics.baymo_handled > 0 || suggestions.length > 0) {
    const [{ data: members }, { data: already }] = await Promise.all([
      db.from('profiles').select('id').eq('client_id', clientId),
      db.from('notifications').select('user_id')
        .eq('client_id', clientId).eq('type', 'daily_digest')
        .eq('data->>digest_date', activityDate),
    ]);
    const done = new Set(((already as { user_id: string }[]) ?? []).map((r) => r.user_id));
    const body = metrics.automation_active
      ? `🌟 ${metrics.new_leads} new lead${metrics.new_leads === 1 ? '' : 's'} · 💬 BaMo handled ${metrics.baymo_handled} · 🔥 ${metrics.turned_hot} turned Hot`
      : `🌟 ${metrics.new_leads} new lead${metrics.new_leads === 1 ? '' : 's'} yesterday — BaMo automation is off. Activate a campaign and let BaMo handle them.`;
    const rows = (((members as { id: string }[]) ?? []).filter((m) => !done.has(m.id))).map((m) => ({
      user_id: m.id,
      client_id: clientId,
      type: 'daily_digest',
      title: 'Your BaMo morning update ☀️',
      body,
      data: { digest_date: activityDate },
    }));
    if (rows.length) {
      const { error } = await db.from('notifications').insert(rows);
      if (!error) notified = rows.length;
    }
  }

  return { client_id: clientId, metrics, suggestions: suggestions.length, tasks_created: tasksCreated, notified };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return j({ error: 'POST only' }, 405);

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default'],
  );

  // Same trusted-cron secret push-dispatch uses (Vault-held, checked via RPC).
  const secret = req.headers.get('x-digest-secret') ?? '';
  const { data: authorized } = await db.rpc('check_push_dispatch_secret', { p: secret });
  if (!authorized) return j({ error: 'unauthorized' }, 401);

  let body: { date?: string; client_id?: string; dry_run?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // empty body from cron is fine
  }

  const activityDate =
    body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : manilaDate(1);

  let clientQ = db.from('clients').select('id');
  if (body.client_id) clientQ = clientQ.eq('id', body.client_id);
  const { data: clients, error } = await clientQ;
  if (error) return j({ error: error.message }, 500);

  const results = [];
  for (const c of (clients as { id: string }[]) ?? []) {
    try {
      results.push(await digestForClient(db, c.id, activityDate, body.dry_run === true));
    } catch (e) {
      results.push({ client_id: c.id, error: String(e) });
    }
  }
  return j({ date: activityDate, clients: results.length, results });
});
