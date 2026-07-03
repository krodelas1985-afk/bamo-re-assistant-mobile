import { BadgeTone } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';

/**
 * Live leads data layer. Queries the shared BaMo `leads` table; RLS scopes rows
 * to the signed-in user's client automatically (leads_select policy), so we never
 * pass client_id from the app.
 */

/** Raw columns we read from `leads`. */
type LeadRow = {
  id: string;
  name: string;
  phone: string | null;
  source: string | null;
  status: string | null;
  lead_temperature: string | null;
  conversation_summary: string | null;
  messenger_id: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  created_at: string | null;
};

const SELECT =
  'id, name, phone, source, status, lead_temperature, conversation_summary, messenger_id, last_message_at, last_inbound_at, created_at';

/** Card model consumed by the Leads screen. */
export type Lead = {
  id: string;
  name: string;
  timestamp: string;
  source: string;
  status: string; // display label (temperature-driven)
  statusTone: BadgeTone;
  summary: string;
  // Raw fields kept for actions / filtering
  temperature: string | null;
  rawStatus: string | null;
  messengerId: string | null;
  phone: string | null;
};

export type LeadFilter = 'hot' | 'ready' | 'viewing' | 'all';

/**
 * Filter → data mapping. Kept in one place so it's easy to retune as the pipeline
 * evolves. NOTE: 'viewing' has no dedicated appointments source yet, so it maps to
 * the `Won` status as an interim proxy (decided 2026-07-04) — swap this for a real
 * appointments join when that feature lands.
 */
export const LEAD_FILTERS: { key: LeadFilter; label: string }[] = [
  { key: 'hot', label: '🔥 Hot' },
  { key: 'ready', label: '✅ Ready' },
  { key: 'viewing', label: '📅 For Viewing' },
  { key: 'all', label: 'All' },
];

const VIEWING_STATUS = 'Won'; // interim proxy — see note above

export function matchesFilter(lead: Lead, filter: LeadFilter): boolean {
  switch (filter) {
    case 'hot':
      return lead.temperature === 'Hot';
    case 'ready':
      return lead.temperature === 'Warm';
    case 'viewing':
      return lead.rawStatus === VIEWING_STATUS;
    case 'all':
    default:
      return true;
  }
}

/** Temperature → badge label + tone. */
function badgeFor(temperature: string | null, rawStatus: string | null): { label: string; tone: BadgeTone } {
  if (rawStatus === VIEWING_STATUS) return { label: 'For Viewing', tone: 'info' };
  switch (temperature) {
    case 'Hot':
      return { label: '🔥 Hot', tone: 'warm' };
    case 'Warm':
      return { label: 'Ready', tone: 'success' };
    case 'Cold':
      return { label: 'Cold', tone: 'neutral' };
    case 'New':
    default:
      return { label: 'New', tone: 'info' };
  }
}

/** Compact "time ago" from an ISO timestamp. */
export function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function toLead(row: LeadRow): Lead {
  const badge = badgeFor(row.lead_temperature, row.status);
  const recency = row.last_message_at ?? row.last_inbound_at ?? row.created_at;
  const summary =
    row.conversation_summary?.trim() ||
    `New ${row.source ?? 'lead'} — tap to review the conversation.`;
  return {
    id: row.id,
    name: row.name,
    timestamp: relativeTime(recency),
    source: row.source ?? 'Unknown',
    status: badge.label,
    statusTone: badge.tone,
    summary,
    temperature: row.lead_temperature,
    rawStatus: row.status,
    messengerId: row.messenger_id,
    phone: row.phone,
  };
}

/** Fetch all leads visible to the current user (RLS-scoped), most-recent first. */
export async function fetchLeads(): Promise<{ data: Lead[]; error: string | null }> {
  const { data, error } = await supabase
    .from('leads')
    .select(SELECT)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return { data: [], error: error.message };
  return { data: (data as LeadRow[]).map(toLead), error: null };
}

export type LeadStats = {
  newThisWeek: number;
  hot: number;
  ready: number;
  forViewing: number;
};

/** Home dashboard counts — all derived from the RLS-scoped leads table. */
export async function fetchLeadStats(): Promise<LeadStats> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const count = async (build: (q: any) => any): Promise<number> => {
    const { count: c } = await build(
      supabase.from('leads').select('id', { count: 'exact', head: true }),
    );
    return c ?? 0;
  };
  const [newThisWeek, hot, ready, forViewing] = await Promise.all([
    count((q) => q.gte('created_at', weekAgo)),
    count((q) => q.eq('lead_temperature', 'Hot')),
    count((q) => q.eq('lead_temperature', 'Warm')),
    count((q) => q.eq('status', VIEWING_STATUS)),
  ]);
  return { newThisWeek, hot, ready, forViewing };
}

/** Mark a lead as handled by the agent (records contact time). */
export async function markLeadHandled(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('leads')
    .update({ last_contacted_at: new Date().toISOString() })
    .eq('id', id);
  return { error: error ? error.message : null };
}
