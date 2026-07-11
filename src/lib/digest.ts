import { supabase } from '@/lib/supabase';

/**
 * Morning digest (daily_digests table) — written by the daily-digest edge
 * function at 6:15 AM Manila, one row per client per day, summarizing the
 * previous day. RLS lets every client member read their client's digest;
 * agents filter the takeover suggestions to their own leads app-side.
 */

export type DigestMetrics = {
  new_leads: number;
  baymo_handled: number;
  turned_warm: number;
  turned_hot: number;
  automation_active: boolean;
};

export type DigestSuggestion = {
  lead_id: string;
  name: string;
  temperature: string;
  assigned_user_id: string | null;
  reason: string;
};

export type DailyDigest = {
  digest_date: string; // the day the digest summarizes (yesterday, YYYY-MM-DD)
  metrics: DigestMetrics;
  suggestions: DigestSuggestion[];
};

/**
 * Latest digest, or null when none exists yet / the newest one is stale
 * (older than 2 days — don't resurface last week's numbers after a quiet spell).
 */
export async function fetchLatestDigest(): Promise<DailyDigest | null> {
  const { data, error } = await supabase
    .from('daily_digests')
    .select('digest_date, metrics, suggestions')
    .order('digest_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const digest = data as unknown as DailyDigest;
  const ageDays = (Date.now() - new Date(`${digest.digest_date}T00:00:00+08:00`).getTime()) / 864e5;
  if (ageDays > 2) return null;
  return {
    digest_date: digest.digest_date,
    metrics: {
      new_leads: digest.metrics?.new_leads ?? 0,
      baymo_handled: digest.metrics?.baymo_handled ?? 0,
      turned_warm: digest.metrics?.turned_warm ?? 0,
      turned_hot: digest.metrics?.turned_hot ?? 0,
      automation_active: digest.metrics?.automation_active ?? false,
    },
    suggestions: Array.isArray(digest.suggestions) ? digest.suggestions : [],
  };
}

/** Agents only see suggestions for their own leads; admins see all. */
export function visibleSuggestions(
  digest: DailyDigest,
  role: string | null,
  userId: string | null,
): DigestSuggestion[] {
  if (role !== 'agent') return digest.suggestions;
  return digest.suggestions.filter((s) => s.assigned_user_id === userId);
}
