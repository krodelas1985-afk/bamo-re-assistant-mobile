// push-dispatch — sends queued in-app notifications to devices via Expo Push.
//
// Invoked on a schedule (pg_cron → net.http_post, every 2 minutes) rather than
// per insert, so the notifications-insert path stays trigger-light. Each run
// drains notifications where pushed_at IS NULL, applies per-user preferences +
// Manila quiet hours, sends through the Expo Push Service, stamps pushed_at, and
// prunes tokens that Expo reports as DeviceNotRegistered.
//
// The in-app row already exists regardless — this function only governs PUSH.
//
// Deploy: supabase functions deploy push-dispatch --no-verify-jwt
// Auth: the caller (pg_cron via pg_net) presents x-dispatch-secret; we validate
// it against a Vault-held secret through the check_push_dispatch_secret() RPC,
// so no hand-set edge secret is required. Env SUPABASE_URL /
// SUPABASE_SECRET_KEYS are auto-injected by the platform. SUPABASE_SECRET_KEYS
// is a JSON object keyed by key name, not a plain string like the legacy
// SUPABASE_SERVICE_ROLE_KEY it replaces.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MANILA_TZ = 'Asia/Manila';

// Quiet hours in Manila local time: [START, 24) ∪ [0, END).
// END is 6, not 7, so the 6:15 AM daily digest clears the window and goes out
// with the morning update instead of being held until 7. Anything else that
// respects quiet hours also starts flowing an hour earlier — intended: 6 AM is
// the start of the agent's day in this product.
const QUIET_START_HOUR = 21;
const QUIET_END_HOUR = 6;

// Which types push at all, whether they respect quiet hours, the pref column
// that gates them, and the Android channel to deliver on.
const POLICY: Record<
  string,
  { pref: string | null; respectsQuiet: boolean; channel: string; priority: 'default' | 'high' }
> = {
  lead_assigned:            { pref: 'lead_assigned',         respectsQuiet: true,  channel: 'leads',        priority: 'high' },
  lead_reassigned_away:     { pref: null,                    respectsQuiet: true,  channel: 'general',      priority: 'default' }, // in-app only
  lead_hot:                 { pref: 'lead_hot',              respectsQuiet: false, channel: 'leads',        priority: 'high' },   // punches through
  lead_warm:                { pref: 'lead_warm',             respectsQuiet: true,  channel: 'leads',        priority: 'high' },
  appointment_booked:       { pref: 'appointment_reminders', respectsQuiet: true,  channel: 'appointments', priority: 'high' },
  appointment_reminder_day: { pref: 'appointment_reminders', respectsQuiet: true,  channel: 'appointments', priority: 'high' },
  appointment_reminder_hour:{ pref: 'appointment_reminders', respectsQuiet: false, channel: 'appointments', priority: 'high' },
  task_assigned:            { pref: 'tasks',                 respectsQuiet: true,  channel: 'general',      priority: 'default' },
  daily_digest:             { pref: 'daily_digest',          respectsQuiet: true,  channel: 'general',      priority: 'default' },
};

function inManilaQuietHours(now: Date): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: MANILA_TZ, hour: '2-digit', hour12: false }).format(now),
  );
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default'],
  );

  const secret = req.headers.get('x-dispatch-secret') ?? '';
  const { data: authorized } = await supabase.rpc('check_push_dispatch_secret', { p: secret });
  if (authorized !== true) {
    return new Response('unauthorized', { status: 401 });
  }

  const quiet = inManilaQuietHours(new Date());

  // Drain a batch of unpushed notifications (oldest first).
  const { data: notifs, error } = await supabase
    .from('notifications')
    .select('id, user_id, type, title, body, data')
    .is('pushed_at', null)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!notifs || notifs.length === 0) return Response.json({ sent: 0, considered: 0 });

  // Preload preferences + tokens for the distinct recipients in this batch.
  const userIds = [...new Set(notifs.map((n) => n.user_id))];
  const [{ data: prefRows }, { data: tokenRows }] = await Promise.all([
    supabase.from('notification_preferences').select('*').in('user_id', userIds),
    supabase.from('push_tokens').select('user_id, expo_push_token').in('user_id', userIds),
  ]);
  const prefs = new Map((prefRows ?? []).map((p) => [p.user_id, p]));
  const tokensByUser = new Map<string, string[]>();
  for (const t of tokenRows ?? []) {
    const arr = tokensByUser.get(t.user_id) ?? [];
    arr.push(t.expo_push_token);
    tokensByUser.set(t.user_id, arr);
  }

  const messages: { to: string; title: string; body: string; data: unknown; channelId: string; priority: string }[] = [];
  const pushedIds: string[] = [];   // stamp regardless of send (dispatched or intentionally skipped)
  const heldIds: string[] = [];     // quiet-hours hold → leave null, retry next run

  for (const n of notifs) {
    const policy = POLICY[n.type];
    if (!policy) { pushedIds.push(n.id); continue; }               // unknown type → in-app only

    const pref = prefs.get(n.user_id);

    // quiet-hours hold (in-app row already visible; just defer the push).
    // Honours the user's own quiet_hours toggle — default ON when unset.
    const wantsQuiet = pref ? pref.quiet_hours !== false : true;
    if (policy.respectsQuiet && quiet && wantsQuiet) { heldIds.push(n.id); continue; }

    // default ON when no pref row exists yet
    const enabled = policy.pref === null ? false : (pref ? pref[policy.pref] !== false : true);
    if (!enabled) { pushedIds.push(n.id); continue; }              // pref off / no-push type

    const tokens = tokensByUser.get(n.user_id) ?? [];
    if (tokens.length === 0) { pushedIds.push(n.id); continue; }   // no device registered

    for (const to of tokens) {
      messages.push({
        to, title: n.title, body: n.body ?? '', data: n.data,
        channelId: policy.channel, priority: policy.priority,
      });
    }
    pushedIds.push(n.id);
  }

  // Send to Expo in chunks of 100.
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      const json = await res.json();
      if (json?.errors) {
        console.error('[push-dispatch] Expo rejected the request:', JSON.stringify(json.errors));
      }
      const tickets = json?.data ?? [];
      for (let k = 0; k < tickets.length; k++) {
        const ticket = tickets[k];
        if (ticket?.status === 'ok') {
          sent++;
          // A ticket is an ACCEPTANCE, not a delivery. Real failures
          // (MismatchSenderId, InvalidCredentials, MessageTooBig) only surface
          // in the receipt at /push/getReceipts, which nothing polls yet — so
          // keep the id where an operator can find it.
          if (ticket.id) console.log(`[push-dispatch] ticket ${ticket.id} accepted`);
          continue;
        }
        // Anything not ok was previously discarded unless it was
        // DeviceNotRegistered, which is how 209 sends produced no signal.
        console.error(
          `[push-dispatch] ticket not ok: status=${ticket?.status} error=${ticket?.details?.error ?? 'none'} message=${ticket?.message ?? 'none'}`,
        );
        if (ticket?.details?.error === 'DeviceNotRegistered') {
          await supabase.from('push_tokens').delete().eq('expo_push_token', chunk[k].to);
        }
      }
    } catch (e) {
      // network hiccup — leave those notifs stamped; next event re-engages. Do
      // not block the batch. Still say so: a persistently unreachable Expo
      // looked identical to "nothing to send" before.
      console.error('[push-dispatch] send chunk failed:', e instanceof Error ? e.message : String(e));
    }
  }

  if (pushedIds.length) {
    await supabase.from('notifications').update({ pushed_at: new Date().toISOString() }).in('id', pushedIds);
  }

  return Response.json({ considered: notifs.length, sent, held: heldIds.length });
});
