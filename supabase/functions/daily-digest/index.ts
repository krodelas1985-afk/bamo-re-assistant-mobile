import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Daily digest generator — runs at 6:15 AM Manila (pg_cron 22:15 UTC) and, for
 * every client, summarizes YESTERDAY (Manila) into a daily_digests row:
 *   metrics: { new_leads, baymo_handled, turned_warm, turned_hot, automation_active }
 *   suggestions: up to 5 takeover candidates [{lead_id, name, temperature,
 *                assigned_user_id, reason}] — only when automation is active.
 * For each suggestion it also creates a source='baymo' task_type='takeover'
 * task (due today, assigned to the lead's agent) unless one is already pending,
 * and drops a 'daily_digest' notification per client member. push-dispatch has a
 * POLICY entry for that type (pref column daily_digest, quiet-respecting), and
 * Manila quiet hours end at 06:00, so the 06:15 run pushes to the device rather
 * than sitting unread in the Notification Center.
 *
 * When the client has NO active campaign, there are no suggestions/tasks; the
 * digest instead carries automation_active=false so the app can show
 * "BaMo automation is off — activate a campaign" (per Kathy, 2026-07-11).
 *
 * The same digest is ALSO emailed to the client's admins (2026-08-12). Push has
 * never reached a handset here, so the in-app notification is the only channel
 * that has ever landed — and only for people who open the app. Email is what
 * actually gets read; see the W9 lead-alert emailer for the precedent.
 *
 * Auth: pg_cron (via pg_net) sends x-digest-secret, validated against the same
 * Vault secret push-dispatch uses (check_push_dispatch_secret RPC) — the caller
 * is the same trusted cron. verify_jwt=false; nothing runs without the secret.
 * Manual test runs may POST { date?: 'YYYY-MM-DD', client_id?: uuid, dry_run?: true }.
 * A dry run sends nothing and returns the rendered subject + resolved recipients
 * so the template can be proven before it reaches a real inbox.
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

type Metrics = {
  new_leads: number;
  baymo_handled: number;
  turned_warm: number;
  turned_hot: number;
  automation_active: boolean;
};

// Resend, same verified sender the lead-alert emailer (W9) uses. The key is a
// separate edge-function secret; when it is absent the digest still generates
// and the email is skipped rather than failing the run.
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DIGEST_FROM = 'BaMo <notifications@send.bahaymo.com>';
const OPS_BCC = 'bamophilippines@gmail.com';
const CRM_BASE = 'https://app.bahaymo.com';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "August 11, 2026" from a YYYY-MM-DD Manila date. */
function prettyDate(d: string): string {
  return new Date(`${d}T00:00:00+08:00`).toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * The email carries the same numbers as the in-app card plus the full takeover
 * list — the app filters suggestions per agent, but this goes to the client's
 * admins, who see the whole workspace anyway.
 */
function renderDigestEmail(activityDate: string, m: Metrics, suggestions: Suggestion[]) {
  const subject = m.automation_active
    ? `Your BaMo morning update — ${m.new_leads} new lead${m.new_leads === 1 ? '' : 's'}, ${m.turned_hot} turned Hot`
    : `Your BaMo morning update — ${m.new_leads} new lead${m.new_leads === 1 ? '' : 's'}, automation is off`;

  const stat = (label: string, value: string | number, color: string) => `
    <td style="padding:12px 8px;text-align:center;">
      <div style="font-family:Poppins,Arial,sans-serif;font-size:28px;font-weight:700;color:${color};line-height:34px;">${value}</div>
      <div style="font-family:Inter,Arial,sans-serif;font-size:12px;color:#5B5B5B;line-height:18px;">${label}</div>
    </td>`;

  const rows = suggestions
    .map(
      (s) => `
      <tr>
        <td style="padding:12px 16px;border-top:1px solid #E5E7EB;font-family:Poppins,Arial,sans-serif;font-size:14px;color:#3A3A3A;">
          <strong>${esc(s.name)}</strong>
          <span style="color:${s.temperature === 'Hot' ? '#E74C3C' : '#E67E22'};font-size:12px;">&nbsp;${esc(s.temperature)}</span>
          <div style="font-family:Inter,Arial,sans-serif;font-size:12px;color:#5B5B5B;line-height:18px;">${esc(s.reason)}</div>
        </td>
        <td style="padding:12px 16px;border-top:1px solid #E5E7EB;text-align:right;white-space:nowrap;">
          <a href="${CRM_BASE}/leads/${s.lead_id}" style="font-family:Poppins,Arial,sans-serif;font-size:13px;font-weight:600;color:#1F3C88;text-decoration:none;">Open lead &rarr;</a>
        </td>
      </tr>`,
    )
    .join('');

  const closing = m.automation_active
    ? suggestions.length
      ? `<p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#5B5B5B;line-height:20px;">These leads replied and are waiting to hear from a person. BaMo has kept them warm — the handover is yours.</p>`
      : `<p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#5B5B5B;line-height:20px;">Nothing needs your hands today. BaMo is handling the follow-ups.</p>`
    : `<p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#5B5B5B;line-height:20px;"><strong style="color:#E67E22;">BaMo automation is off.</strong> Activate a campaign and BaMo will answer and follow up on these leads for you.</p>`;

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#FFF7ED;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7ED;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #EBE1CF;">
        <tr><td style="background:#1F3C88;padding:20px 24px;">
          <div style="font-family:Poppins,Arial,sans-serif;font-size:18px;font-weight:600;color:#FFFFFF;line-height:24px;">Your BaMo morning update &#9728;</div>
          <div style="font-family:Inter,Arial,sans-serif;font-size:12px;color:#F3C098;line-height:18px;">What happened on ${prettyDate(activityDate)}</div>
        </td></tr>
        <tr><td style="padding:8px 8px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            ${stat('New leads', m.new_leads, '#1F3C88')}
            ${stat('BaMo handled', m.baymo_handled, '#1F3C88')}
            ${stat('Turned Warm', m.turned_warm, '#E67E22')}
            ${stat('Turned Hot', m.turned_hot, '#E74C3C')}
          </tr></table>
        </td></tr>
        ${
          suggestions.length
            ? `<tr><td style="padding:16px 24px 0;">
                 <div style="font-family:Poppins,Arial,sans-serif;font-size:16px;font-weight:600;color:#3A3A3A;line-height:22px;">Needs you today</div>
               </td></tr>
               <tr><td style="padding:4px 8px 0;">
                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
               </td></tr>`
            : ''
        }
        <tr><td style="padding:20px 24px 24px;">${closing}</td></tr>
        <tr><td style="background:#FFFDF8;padding:14px 24px;border-top:1px solid #EBE1CF;">
          <div style="font-family:Inter,Arial,sans-serif;font-size:11px;color:#9CA3AF;line-height:16px;">BaMo &middot; Real Estate Made Simple &middot; <a href="${CRM_BASE}" style="color:#1F3C88;text-decoration:none;">Open BaMo</a></div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

  const text = [
    `Your BaMo morning update — ${prettyDate(activityDate)}`,
    '',
    `New leads: ${m.new_leads}`,
    `BaMo handled: ${m.baymo_handled}`,
    `Turned Warm: ${m.turned_warm}`,
    `Turned Hot: ${m.turned_hot}`,
    '',
    ...(suggestions.length
      ? [
          'Needs you today:',
          ...suggestions.map((s) => `- ${s.name} (${s.temperature}) — ${s.reason}\n  ${CRM_BASE}/leads/${s.lead_id}`),
          '',
        ]
      : []),
    m.automation_active
      ? 'BaMo is handling the follow-ups.'
      : 'BaMo automation is off. Activate a campaign and BaMo will answer and follow up for you.',
  ].join('\n');

  return { subject, html, text };
}

/**
 * Claim-then-send: the ledger row goes in BEFORE Resend is called, so a retried
 * or overlapping cron tick collides on (client_id, digest_date) and no client is
 * mailed twice. Never throws — a failed email must not cost the digest itself.
 */
async function emailDigest(
  db: SupabaseClient,
  clientId: string,
  activityDate: string,
  metrics: Metrics,
  suggestions: Suggestion[],
): Promise<string> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return 'skipped:no_key';

  const { data: recipients } = await db.rpc('digest_email_recipients', { p_client_id: clientId });
  const to = ((recipients as string[] | null) ?? []).filter(Boolean);
  if (!to.length) return 'skipped:no_recipient';

  const { subject, html, text } = renderDigestEmail(activityDate, metrics, suggestions);

  const { data: claim, error: claimErr } = await db
    .from('daily_digest_emails')
    .insert({ client_id: clientId, digest_date: activityDate, to_emails: to, subject })
    .select('id')
    .single();
  if (claimErr || !claim) return 'skipped:already_sent'; // unique index — someone got here first

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: DIGEST_FROM, to, bcc: [OPS_BCC], subject, html, text }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      await db.from('daily_digest_emails').update({
        status: 'failed',
        error: JSON.stringify(payload).slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq('id', (claim as { id: string }).id);
      return 'failed';
    }
    await db.from('daily_digest_emails').update({
      status: 'sent',
      provider_id: (payload as { id?: string }).id ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', (claim as { id: string }).id);
    return 'sent';
  } catch (e) {
    await db.from('daily_digest_emails').update({
      status: 'failed',
      error: String(e).slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq('id', (claim as { id: string }).id);
    return 'failed';
  }
}

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

  // Something worth saying at all — gates both the in-app notification and the
  // email, so quiet clients don't get a daily "nothing happened".
  const hasNews = metrics.new_leads > 0 || metrics.baymo_handled > 0 || suggestions.length > 0;

  if (dryRun) {
    const { data: recipients } = await db.rpc('digest_email_recipients', { p_client_id: clientId });
    const { subject, html, text } = renderDigestEmail(activityDate, metrics, suggestions);
    return {
      client_id: clientId,
      metrics,
      suggestions,
      dry_run: true,
      email: { would_send: hasNews, to: recipients ?? [], subject, html, text },
    };
  }

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
  if (hasNews) {
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

  // Email the same digest to the client's admins — the channel that actually
  // lands. Deliberately after the digest/tasks/notification writes so nothing
  // above depends on Resend being reachable.
  const emailed = hasNews
    ? await emailDigest(db, clientId, activityDate, metrics, suggestions)
    : 'skipped:no_news';

  return {
    client_id: clientId,
    metrics,
    suggestions: suggestions.length,
    tasks_created: tasksCreated,
    notified,
    emailed,
  };
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
