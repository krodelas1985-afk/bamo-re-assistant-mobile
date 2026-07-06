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

/**
 * The current client's PUBLIC Facebook Page ID (clients.fb_page_id), used to
 * deep-link a Messenger lead into the client's Page inbox. Served by the
 * get_my_fb_page_id() security-definer RPC because the clients table itself is
 * baymo_admin-only RLS (and holds secrets we must not expose). Returns null when
 * the client hasn't connected a Page yet. All the signed-in user's leads share
 * this one Page, so the screen fetches it once.
 */
export async function fetchMyFbPageId(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_my_fb_page_id');
  if (error) return null;
  return (data as string | null) ?? null;
}

/** Extra per-lead fields shown only on the Lead Profile screen. */
export type LeadDetail = Lead & {
  email: string | null;
  currentLocation: string | null;
  timeframe: string | null;
  motivation: string | null;
  leadScore: number | null;
  qualification: LeadQualification | null;
};

/** Qualification answers gathered by BaMo (lead_qualifications, one row per lead). */
export type LeadQualification = {
  budgetMin: number | null;
  budgetMax: number | null;
  propertyType: string | null;
  propertySubType: string | null;
  bedrooms: number | null;
  preferredLocation: string[] | null;
  paymentScheme: string | null;
  preferredFinancing: string | null;
  moveInDate: string | null;
  purpose: string | null;
  unitPreferred: string | null;
};

const DETAIL_SELECT =
  SELECT + ', email, current_location, timeframe, motivation, lead_score';

type LeadDetailRow = LeadRow & {
  email: string | null;
  current_location: string | null;
  timeframe: string | null;
  motivation: string | null;
  lead_score: number | null;
};

/**
 * Fetch one lead with profile + qualification data. Returns data: null when the
 * lead is not visible (deleted, or reassigned away — RLS hides the row without
 * an error), so the screen can show a friendly "no longer yours" state.
 */
export async function fetchLeadDetail(
  id: string,
): Promise<{ data: LeadDetail | null; error: string | null }> {
  const [leadRes, qualRes] = await Promise.all([
    supabase.from('leads').select(DETAIL_SELECT).eq('id', id).maybeSingle(),
    supabase
      .from('lead_qualifications')
      .select(
        'budget_min, budget_max, property_type, property_sub_type, bedrooms, preferred_location, payment_scheme, preferred_financing, move_in_date, purpose, unit_preferred',
      )
      .eq('lead_id', id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (leadRes.error) return { data: null, error: leadRes.error.message };
  if (!leadRes.data) return { data: null, error: null };
  const row = leadRes.data as unknown as LeadDetailRow;
  const q = qualRes.data as Record<string, any> | null; // qual errors are non-fatal — profile still renders
  return {
    data: {
      ...toLead(row),
      email: row.email,
      currentLocation: row.current_location,
      timeframe: row.timeframe,
      motivation: row.motivation,
      leadScore: row.lead_score,
      qualification: q
        ? {
            budgetMin: q.budget_min,
            budgetMax: q.budget_max,
            propertyType: q.property_type,
            propertySubType: q.property_sub_type,
            bedrooms: q.bedrooms,
            preferredLocation: q.preferred_location,
            paymentScheme: q.payment_scheme,
            preferredFinancing: q.preferred_financing,
            moveInDate: q.move_in_date,
            purpose: q.purpose,
            unitPreferred: q.unit_preferred,
          }
        : null,
    },
    error: null,
  };
}

/** One message in a lead's conversation transcript. */
export type ConversationMessage = {
  id: string;
  from: 'lead' | 'agent' | 'baymo';
  text: string;
  attachmentType: string | null;
  time: string; // pre-formatted relative time
};

/**
 * Sender attribution mirrors the CRM's senderLabel helper (repo-explore
 * src/lib/utils.ts): ai/sequence/system senders and sent_via='baymo' are BaMo,
 * otherwise trust the sender field, otherwise fall back to direction.
 */
function messageFrom(row: {
  sender: string | null;
  sent_via: string | null;
  direction: string | null;
}): ConversationMessage['from'] {
  const sender = (row.sender ?? '').toLowerCase();
  if (sender === 'ai' || sender === 'sequence' || sender === 'system' || row.sent_via === 'baymo')
    return 'baymo';
  if (sender === 'agent') return 'agent';
  if (sender === 'lead') return 'lead';
  return row.direction === 'outbound' ? 'agent' : 'lead';
}

/**
 * The last 100 messages for a lead, oldest first (chat order). RLS only allows
 * this for leads assigned to the signed-in agent.
 */
export async function fetchConversation(
  leadId: string,
): Promise<{ data: ConversationMessage[]; error: string | null }> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, direction, sender, sent_via, message_content, attachment_type, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return { data: [], error: error.message };
  const messages = (data as any[])
    .reverse()
    .map((row) => ({
      id: row.id,
      from: messageFrom(row),
      text: row.message_content?.trim() ?? '',
      attachmentType: row.attachment_type,
      time: relativeTime(row.created_at),
    }))
    // Skip rows with nothing to show (no text and no attachment marker).
    .filter((m) => m.text || m.attachmentType);
  return { data: messages, error: null };
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

/**
 * Mark a lead as handled by the agent (records contact time).
 *
 * If the lead was reassigned to another agent since this list was loaded, RLS
 * hides the row and the UPDATE silently matches zero rows (no error). We ask for
 * the affected rows back so the caller can tell the difference and show a
 * friendly "reassigned" message instead of a false success.
 */
export async function markLeadHandled(
  id: string,
): Promise<{ error: string | null; reassigned?: boolean }> {
  const { data, error } = await supabase
    .from('leads')
    .update({ last_contacted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: null, reassigned: true };
  return { error: null };
}
