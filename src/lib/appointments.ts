import { supabase } from '@/lib/supabase';

/** Agent-scheduled appointments (viewings + calls), table public.appointments. */

export type AppointmentType = 'viewing' | 'call' | 'event';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export type Appointment = {
  id: string;
  lead_id: string | null;
  title: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  appointment_type: AppointmentType;
  scheduled_at: string; // ISO
  location: string | null;
  notes: string | null;
  status: AppointmentStatus;
};

export type AppointmentInput = {
  lead_id: string | null;
  title: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  appointment_type: AppointmentType;
  scheduled_at: string;
  location: string | null;
  notes: string | null;
};

const SELECT =
  'id, lead_id, title, contact_name, contact_phone, appointment_type, scheduled_at, location, notes, status';

/** Human label + emoji for an appointment type. */
export function typeMeta(t: AppointmentType): { label: string; emoji: string } {
  switch (t) {
    case 'viewing':
      return { label: 'Viewing', emoji: '🏡' };
    case 'call':
      return { label: 'Phone call', emoji: '📞' };
    case 'event':
    default:
      return { label: 'Event', emoji: '📌' };
  }
}

/** The card's primary line: contact for viewings/calls, title for events. */
export function appointmentTitle(a: Appointment): string {
  if (a.appointment_type === 'event') return a.title || 'Event';
  return a.contact_name || a.title || 'Appointment';
}

/** Upcoming scheduled appointments (RLS-scoped), soonest first. */
export async function fetchUpcoming(): Promise<{ data: Appointment[]; error: string | null }> {
  const { data, error } = await supabase
    .from('appointments')
    .select(SELECT)
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // include the last hour
    .order('scheduled_at', { ascending: true })
    .limit(100);
  if (error) return { data: [], error: error.message };
  return { data: (data as Appointment[]) ?? [], error: null };
}

export async function createAppointment(
  clientId: string,
  userId: string,
  input: AppointmentInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('appointments')
    .insert({ ...input, client_id: clientId, created_by: userId });
  return { error: error ? error.message : null };
}

export async function setAppointmentStatus(
  id: string,
  status: AppointmentStatus,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('appointments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error: error ? error.message : null };
}

/** Lightweight lead list for the appointment contact picker. */
export async function fetchLeadOptions(): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase
    .from('leads')
    .select('id, name')
    .order('name', { ascending: true })
    .limit(200);
  return (data as { id: string; name: string }[]) ?? [];
}

// ── display helpers ───────────────────────────────────────────────────────

/** Bucket an appointment into Today / Tomorrow / a weekday-or-date label. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(now)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return d.toLocaleDateString('en-PH', { weekday: 'long' });
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

/**
 * A Google Calendar "add event" link, pre-filled with the appointment. Opening it
 * (web or native) drops the agent into Google Calendar with everything ready to
 * save — no login/OAuth needed. Assumes a 1-hour default duration.
 */
export function googleCalendarUrl(a: Appointment): string {
  const start = new Date(a.scheduled_at);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const prefix =
    a.appointment_type === 'viewing'
      ? 'Property Viewing'
      : a.appointment_type === 'call'
        ? 'Call'
        : 'Event';
  const subject = appointmentTitle(a);
  const title = a.appointment_type === 'event' ? subject : `${prefix} — ${subject}`;
  const details = `${a.notes ? a.notes + '\n\n' : ''}Scheduled via BaMo`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details,
  });
  if (a.location) params.set('location', a.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function groupByDay(items: Appointment[]): { label: string; items: Appointment[] }[] {
  const groups: { label: string; items: Appointment[] }[] = [];
  for (const a of items) {
    const label = dayLabel(a.scheduled_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(a);
    else groups.push({ label, items: [a] });
  }
  return groups;
}
