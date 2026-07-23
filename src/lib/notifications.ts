import { supabase } from '@/lib/supabase';

/**
 * In-app Notification Center data layer. Reads public.notifications (RLS scopes
 * to the signed-in user) and the per-user notification_preferences row. Rows are
 * written server-side by the Phase 0 triggers / reminder sweep; the client only
 * reads, marks read, and edits preferences.
 */

export type NotificationType =
  | 'lead_assigned'
  | 'lead_reassigned_away'
  | 'lead_hot'
  | 'lead_warm'
  | 'appointment_booked'
  | 'appointment_reminder_day'
  | 'appointment_reminder_hour'
  | 'task_assigned'
  | string;

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  route: string | null;
  readAt: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: { route?: string } | null;
  read_at: string | null;
  created_at: string;
};

export async function fetchNotifications(): Promise<{ data: AppNotification[]; error: string | null }> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, data, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return { data: [], error: error.message };
  const rows = (data as Row[]) ?? [];
  return {
    data: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      route: r.data?.route ?? null,
      readAt: r.read_at,
      createdAt: r.created_at,
    })),
    error: null,
  };
}

/**
 * High-priority notification types that mean "a lead needs the agent personally"
 * — e.g. a B2B lead asked for a call, wants to reserve/buy, or an urgent issue the
 * AI escalated. Surfaced on Home as an urgent BayMo flag (not just in the
 * Notification Center).
 *
 * Contract: the campaign responder's `notify_agent` path (n8n Workflow 2) inserts
 * `lead_action_needed` via create_notification(), data `{ lead_id, route }`, IN
 * ADDITION to the Resend email. Any campaign that adopts the same insert lights up
 * here automatically — no mobile change needed. `lead_action_needed` is the live
 * type; the rest are reserved aliases for future escalation sources.
 */
export const ATTENTION_TYPES = [
  'lead_action_needed',
  'lead_needs_attention',
  'lead_call_request',
  'lead_escalation',
] as const;

/** Unread, un-actioned attention flags for the Home "BayMo needs you" bubble. */
export async function fetchAttentionFlags(limit = 5): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, data, read_at, created_at')
    .in('type', ATTENTION_TYPES as unknown as string[])
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  const rows = (data as Row[]) ?? [];
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    route: r.data?.route ?? null,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
}

export async function fetchUnreadCount(): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
}

export async function markAllNotificationsRead(): Promise<void> {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
}

// ── Preferences ─────────────────────────────────────────────────────────────

export type NotificationPrefs = {
  lead_assigned: boolean;
  lead_hot: boolean;
  lead_warm: boolean;
  appointment_reminders: boolean;
  tasks: boolean;
  ads_updates: boolean;
  quiet_hours: boolean;
};

export const DEFAULT_PREFS: NotificationPrefs = {
  lead_assigned: true,
  lead_hot: true,
  lead_warm: true,
  appointment_reminders: true,
  tasks: true,
  ads_updates: true,
  quiet_hours: true,
};

/** Returns the user's saved preferences, or all-on defaults if no row exists. */
export async function fetchPreferences(): Promise<NotificationPrefs> {
  const { data } = await supabase
    .from('notification_preferences')
    .select('lead_assigned, lead_hot, lead_warm, appointment_reminders, tasks, ads_updates, quiet_hours')
    .maybeSingle();
  return { ...DEFAULT_PREFS, ...((data as Partial<NotificationPrefs>) ?? {}) };
}

export async function savePreferences(
  userId: string,
  prefs: NotificationPrefs,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({ user_id: userId, ...prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  return { error: error ? error.message : null };
}
