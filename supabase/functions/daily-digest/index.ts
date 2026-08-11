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
 * Email send policy (2026-08-12), designed so a quiet client costs nothing:
 *   - dormant (no new lead, no inbound reply, no BaMo message in the 5 Manila
 *     days ending on the digest day) → no email at all. Derived from a rolling
 *     window, NOT a stored flag, so the morning a lead arrives — new or
 *     returning — the window refills and email resumes by itself.
 *   - automation ON  → the morning update, on days there is news.
 *   - automation OFF → the "BaMo is off" nudge carrying yesterday's numbers and
 *     the Hot leads sitting unanswered, sent ONLY on days leads actually came in
 *     or replied. Never on a quiet day: the nudge should always point at
 *     something concrete rather than become a daily drumbeat.
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

type HotLead = { lead_id: string; name: string; temperature: string };
type Totals = { hot: number; warm: number };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Two shapes of email:
 *
 * - automation ON  → the morning update: yesterday's numbers + the takeover list.
 *   (The app filters suggestions per agent; this goes to the client's admins,
 *   who see the whole workspace anyway.)
 * - automation OFF → the nudge: BaMo is off, here is what came in anyway, and
 *   here are the Hot leads sitting unanswered. Sent only on days leads actually
 *   arrived, so it always has something concrete to point at.
 */
function renderDigestEmail(
  activityDate: string,
  m: Metrics,
  suggestions: Suggestion[],
  hot: HotLead[],
  totals: Totals,
) {
  const subject = m.automation_active
    ? `Your BaMo morning update — ${plural(m.new_leads, 'new lead')}, ${m.turned_hot} turned Hot`
    : `BaMo is off — ${plural(m.new_leads, 'new lead')} yesterday, ${plural(totals.hot, 'Hot lead')} waiting`;

  const stat = (label: string, value: string | number, color: string) => `
    <td style="padding:12px 8px;text-align:center;">
      <div style="font-family:Poppins,Arial,sans-serif;font-size:28px;font-weight:700;color:${color};line-height:34px;">${value}</div>
      <div style="font-family:Inter,Arial,sans-serif;font-size:12px;color:#5B5B5B;line-height:18px;">${label}</div>
    </td>`;

  const leadRow = (id: string, name: string, temperature: string, sub: string) => `
      <tr>
        <td style="padding:12px 16px;border-top:1px solid #E5E7EB;font-family:Poppins,Arial,sans-serif;font-size:14px;color:#3A3A3A;">
          <strong>${esc(name)}</strong>
          <span style="color:${temperature === 'Hot' ? '#E74C3C' : '#E67E22'};font-size:12px;">&nbsp;${esc(temperature)}</span>
          <div style="font-family:Inter,Arial,sans-serif;font-size:12px;color:#5B5B5B;line-height:18px;">${esc(sub)}</div>
        </td>
        <td style="padding:12px 16px;border-top:1px solid #E5E7EB;text-align:right;white-space:nowrap;">
          <a href="${CRM_BASE}/leads/${id}" style="font-family:Poppins,Arial,sans-serif;font-size:13px;font-weight:600;color:#1F3C88;text-decoration:none;">Open lead &rarr;</a>
        </td>
      </tr>`;

  const section = (heading: string, rowsHtml: string, note = '') =>
    rowsHtml
      ? `<tr><td style="padding:16px 24px 0;">
           <div style="font-family:Poppins,Arial,sans-serif;font-size:16px;font-weight:600;color:#3A3A3A;line-height:22px;">${heading}</div>
           ${note ? `<div style="font-family:Inter,Arial,sans-serif;font-size:12px;color:#5B5B5B;line-height:18px;">${note}</div>` : ''}
         </td></tr>
         <tr><td style="padding:4px 8px 0;">
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
         </td></tr>`
      : '';

  const body = m.automation_active
    ? section(
        'Needs you today',
        suggestions.map((s) => leadRow(s.lead_id, s.name, s.temperature, s.reason)).join(''),
      )
    : section(
        'Hot leads waiting for an answer',
        hot.map((h) => leadRow(h.lead_id, h.name, h.temperature, 'Asked a question and never got a reply')).join(''),
        totals.hot > hot.length ? `Showing ${hot.length} of ${totals.hot}.` : '',
      );

  const cta = m.automation_active
    ? ''
    : `<tr><td style="padding:20px 24px 0;" align="center">
         <a href="${CRM_BASE}/campaigns" style="display:inline-block;background:#E67E22;color:#FFFFFF;font-family:Poppins,Arial,sans-serif;font-size:16px;font-weight:600;line-height:24px;padding:12px 28px;border-radius:8px;text-decoration:none;">Turn BaMo on</a>
       </td></tr>`;

  const closing = m.automation_active
    ? suggestions.length
      ? `<p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#5B5B5B;line-height:20px;">These leads replied and are waiting to hear from a person. BaMo has kept them warm — the handover is yours.</p>`
      : `<p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#5B5B5B;line-height:20px;">Nothing needs your hands today. BaMo is handling the follow-ups.</p>`
    : `<p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#5B5B5B;line-height:20px;"><strong style="color:#E67E22;">BaMo is off right now.</strong> Turning it on means every inquiry gets answered in seconds — day or night — and you only step in when a lead is ready for you.${totals.warm ? ` You also have ${plural(totals.warm, 'Warm lead')} that could be worked.` : ''}</p>`;

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#FFF7ED;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7ED;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #EBE1CF;">
        <tr><td style="background:#1F3C88;padding:20px 24px;">
          <div style="font-family:Poppins,Arial,sans-serif;font-size:18px;font-weight:600;color:#FFFFFF;line-height:24px;">${
            m.automation_active ? 'Your BaMo morning update &#9728;' : 'BaMo is off &mdash; here is what you missed'
          }</div>
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
        ${body}
        <tr><td style="padding:20px 24px ${m.automation_active ? '24px' : '4px'};">${closing}</td></tr>
        ${cta}
        ${m.automation_active ? '' : '<tr><td style="height:24px;"></td></tr>'}
        <tr><td style="background:#FFFDF8;padding:14px 24px;border-top:1px solid #EBE1CF;">
          <div style="font-family:Inter,Arial,sans-serif;font-size:11px;color:#9CA3AF;line-height:16px;">BaMo &middot; Real Estate Made Simple &middot; <a href="${CRM_BASE}" style="color:#1F3C88;text-decoration:none;">Open BaMo</a></div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

  const text = [
    m.automation_active
      ? `Your BaMo morning update — ${prettyDate(activityDate)}`
      : `BaMo is off — here is what you missed on ${prettyDate(activityDate)}`,
    '',
    `New leads: ${m.new_leads}`,
    `BaMo handled: ${m.baymo_handled}`,
    `Turned Warm: ${m.turned_warm}`,
    `Turned Hot: ${m.turned_hot}`,
    '',
    ...(m.automation_active
      ? suggestions.length
        ? [
            'Needs you today:',
            ...suggestions.map((s) => `- ${s.name} (${s.temperature}) — ${s.reason}\n  ${CRM_BASE}/leads/${s.lead_id}`),
            '',
            'BaMo is handling the follow-ups.',
          ]
        : ['BaMo is handling the follow-ups.']
      : [
          ...(hot.length
            ? [
                `Hot leads waiting for an answer${totals.hot > hot.length ? ` (showing ${hot.length} of ${totals.hot})` : ''}:`,
                ...hot.map((h) => `- ${h.name} (${h.temperature})\n  ${CRM_BASE}/leads/${h.lead_id}`),
                '',
              ]
            : []),
          'BaMo is off right now. Turning it on means every inquiry gets answered in seconds — day or night — and you only step in when a lead is ready for you.',
          ...(totals.warm ? [`You also have ${plural(totals.warm, 'Warm lead')} that could be worked.`] : []),
          '',
          `Turn BaMo on: ${CRM_BASE}/campaigns`,
        ]),
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
  hot: HotLead[],
  totals: Totals,
): Promise<string> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return 'skipped:no_key';

  const { data: recipients } = await db.rpc('digest_email_recipients', { p_client_id: clientId });
  const to = ((recipients as string[] | null) ?? []).filter(Boolean);
  if (!to.length) return 'skipped:no_recipient';

  const { subject, html, text } = renderDigestEmail(activityDate, metrics, suggestions, hot, totals);

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

  // Something worth saying at all — gates the in-app notification, so quiet
  // clients don't get a daily "nothing happened".
  const hasNews = metrics.new_leads > 0 || metrics.baymo_handled > 0 || suggestions.length > 0;

  // When BaMo is off the email becomes a nudge, so it needs the leads that are
  // sitting unanswered — the takeover list above is only built while automation
  // is live. Hot first because that is what the nudge points at.
  let hot: HotLead[] = [];
  let totals: Totals = { hot: 0, warm: 0 };
  if (!automationActive) {
    const [hotRes, hotCount, warmCount] = await Promise.all([
      db.from('leads').select('id, name, lead_temperature')
        .eq('client_id', clientId).eq('lead_temperature', 'Hot')
        .order('last_inbound_at', { ascending: false, nullsFirst: false }).limit(5),
      db.from('leads').select('id', { count: 'exact', head: true })
        .eq('client_id', clientId).eq('lead_temperature', 'Hot'),
      db.from('leads').select('id', { count: 'exact', head: true })
        .eq('client_id', clientId).eq('lead_temperature', 'Warm'),
    ]);
    hot = ((hotRes.data as Record<string, string | null>[]) ?? []).map((l) => ({
      lead_id: l.id!,
      name: l.name ?? 'Lead',
      temperature: l.lead_temperature ?? 'Hot',
    }));
    totals = { hot: hotCount.count ?? 0, warm: warmCount.count ?? 0 };
  }

  // Dormancy, derived rather than stored. A client is dormant when NOTHING
  // happened in the 5 Manila days ending on the digest day — no new lead, no
  // inbound reply from an existing lead, no BaMo message. Dormant clients get no
  // email, and because this is a rolling window rather than a flag, the morning
  // a lead arrives the window refills and the email resumes on its own. There is
  // no dormant state that can get stuck off.
  const windowStart = new Date(new Date(start).getTime() - 4 * 864e5).toISOString();
  const [wLeads, wInbound, wAi, yInbound] = await Promise.all([
    db.from('leads').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).gte('created_at', windowStart).lt('created_at', end),
    db.from('conversations').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('direction', 'inbound')
      .gte('created_at', windowStart).lt('created_at', end),
    db.from('conversations').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).gte('created_at', windowStart).lt('created_at', end)
      .or('sender.in.(ai,sequence,system),sent_via.eq.baymo'),
    db.from('conversations').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('direction', 'inbound')
      .gte('created_at', start).lt('created_at', end),
  ]);
  const activeInWindow =
    (wLeads.count ?? 0) > 0 || (wInbound.count ?? 0) > 0 || (wAi.count ?? 0) > 0;

  // Leads actually arrived or replied yesterday. This is what the "BaMo is off"
  // nudge fires on — never on a quiet day, so it always has something concrete
  // to point at instead of becoming a daily drumbeat.
  const leadsCameIn = metrics.new_leads > 0 || (yInbound.count ?? 0) > 0;

  const emailReason = !activeInWindow
    ? 'skipped:dormant'
    : automationActive
      ? hasNews ? '' : 'skipped:no_news'
      : leadsCameIn ? '' : 'skipped:no_new_leads';

  if (dryRun) {
    const { data: recipients } = await db.rpc('digest_email_recipients', { p_client_id: clientId });
    const { subject, html, text } = renderDigestEmail(activityDate, metrics, suggestions, hot, totals);
    return {
      client_id: clientId,
      metrics,
      suggestions,
      dry_run: true,
      email: {
        would_send: emailReason === '',
        reason: emailReason || 'send',
        active_in_window: activeInWindow,
        leads_came_in: leadsCameIn,
        totals,
        to: recipients ?? [],
        subject,
        html,
        text,
      },
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
  const emailed = emailReason === ''
    ? await emailDigest(db, clientId, activityDate, metrics, suggestions, hot, totals)
    : emailReason;

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
