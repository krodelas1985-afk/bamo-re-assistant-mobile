import { supabase } from '@/lib/supabase';

/**
 * Ads Management section data layer.
 *
 * Reads the shared Ads Manager tables directly under RLS (agent-readable
 * SELECT policies added alongside this feature — these tables previously
 * only granted baymo_admin/client_admin ALL access):
 *  - ad_campaigns    — view-only in v1; management stays in the web app.
 *  - ad_analytics    — daily per-ad performance, aggregated client-side.
 *  - ad_reports      — the weekly AI report is already generated server-side
 *                      by an n8n cron hitting the Ads Manager's report route;
 *                      this just reads the latest row.
 *  - ad_notifications
 *  - campaign_requests — the "request a campaign" CTA; BaMo reviews and
 *                        launches the real Meta campaign in the web app.
 *
 * clients rows hold secrets, so ad-account status goes through the
 * security-definer get_my_ad_account_status() RPC (safe columns only).
 */

export type AdAccountStatus = {
  ad_account_id: string | null;
  ads_enabled: boolean | null;
  ads_plan: string | null;
  is_active: boolean | null;
};

export function isAdsGateOpen(info: AdAccountStatus | null): boolean {
  return !!info && info.is_active !== false && info.ads_enabled === true && !!info.ad_account_id;
}

export async function fetchAdAccountStatus(): Promise<AdAccountStatus | null> {
  const { data } = await supabase.rpc('get_my_ad_account_status');
  return (data?.[0] as AdAccountStatus) ?? null;
}

export type Campaign = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'failed' | string;
  objective: string | null;
  budget_daily: number | null;
  budget_total: number | null;
  starts_at: string | null;
  ends_at: string | null;
  creative_id: string | null;
};

export async function fetchCampaigns(): Promise<Campaign[]> {
  const { data } = await supabase
    .from('ad_campaigns')
    .select('id, name, status, objective, budget_daily, budget_total, starts_at, ends_at, creative_id')
    .order('created_at', { ascending: false })
    .limit(20);
  return (data as Campaign[]) ?? [];
}

export type PerformanceSnapshot = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  ctr: number;
  cpl: number | null;
};

/** Aggregates ad_analytics for the trailing N days (default 7, matches the web report period). */
export async function fetchPerformanceSnapshot(days = 7): Promise<PerformanceSnapshot> {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('ad_analytics')
    .select('impressions, clicks, spend, leads')
    .gte('date', since);
  const rows = data ?? [];
  const totals = rows.reduce(
    (a, r) => ({
      spend: a.spend + (Number(r.spend) || 0),
      impressions: a.impressions + (r.impressions ?? 0),
      clicks: a.clicks + (r.clicks ?? 0),
      leads: a.leads + (r.leads ?? 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0 },
  );
  return {
    ...totals,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
    cpl: totals.leads > 0 ? totals.spend / totals.leads : null,
  };
}

export type AdVerdict = {
  meta_ad_id: string;
  ad_name: string;
  verdict: 'working' | 'watch' | 'fatiguing' | 'kill';
  reason: string;
  suggested_fix: string;
  spend: number | null;
  leads: number | null;
};

export type AdReport = {
  id: string;
  period_start: string;
  period_end: string;
  status: 'completed' | 'no_data' | string;
  summary: string | null;
  verdicts: AdVerdict[];
  created_at: string;
};

export async function fetchLatestReport(): Promise<AdReport | null> {
  const { data } = await supabase
    .from('ad_reports')
    .select('id, period_start, period_end, status, summary, verdicts, created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  return (data?.[0] as AdReport) ?? null;
}

export type AdNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export async function fetchNotifications(): Promise<AdNotification[]> {
  const { data } = await supabase
    .from('ad_notifications')
    .select('id, type, title, message, is_read, created_at')
    .order('created_at', { ascending: false })
    .limit(15);
  return (data as AdNotification[]) ?? [];
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('ad_notifications').update({ is_read: true }).eq('id', id);
}

export async function submitAdAccountSetupRequest(
  clientId: string,
  userId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('subscription_requests').insert({
    client_id: clientId,
    created_by: userId,
    product: 'ads_account_setup',
  });
  return { error: error ? error.message : null };
}

export async function submitCampaignRequest(
  clientId: string,
  userId: string,
  input: {
    goal: string;
    budget_range: string;
    duration_days: number;
    listing_id?: string | null;
    notes?: string | null;
  },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('campaign_requests').insert({
    client_id: clientId,
    created_by: userId,
    ...input,
  });
  return { error: error ? error.message : null };
}

export function money(n: number): string {
  return `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

const VERDICT_META: Record<AdVerdict['verdict'], { label: string; color: string }> = {
  working: { label: 'Working', color: '#2ECC71' },
  watch: { label: 'Watch', color: '#E67E22' },
  fatiguing: { label: 'Fatiguing', color: '#F39C4E' },
  kill: { label: 'Kill', color: '#E74C3C' },
};

export function verdictMeta(v: AdVerdict['verdict']) {
  return VERDICT_META[v] ?? { label: v, color: '#9CA3AF' };
}
