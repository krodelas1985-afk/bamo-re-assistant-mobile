import { supabase } from '@/lib/supabase';

/** One metered resource: how much is used and the plan's cap (null = unlimited). */
export type UsageSection = { used: number; limit: number | null };

export type Usage = {
  plan: string | null;
  ai: UsageSection;
  leads: UsageSection;
  listings: UsageSection;
};

/** Current workspace usage vs plan limits (get_my_usage RPC). */
export async function fetchUsage(): Promise<{ data: Usage | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_my_usage');
  if (error) return { data: null, error: error.message };
  return { data: data as Usage, error: null };
}

/** True when a section has hit its cap. A null limit (pilot/paid) is never at-limit. */
export function atLimit(section: UsageSection | null | undefined): boolean {
  if (!section || section.limit == null) return false;
  return section.used >= section.limit;
}

/** "2 of 10" — or "2" when unlimited. */
export function usageLabel(section: UsageSection | null | undefined): string {
  if (!section) return '—';
  return section.limit == null ? `${section.used}` : `${section.used} of ${section.limit}`;
}

/**
 * The edge functions answer an exhausted AI quota with HTTP 402 +
 * { code: 'ai_limit_reached', limit }. supabase-js surfaces non-2xx as an error
 * whose `context` is the raw Response, so we read the body to detect it. Returns
 * a friendly message, or null if this wasn't an AI-limit error.
 */
export async function aiLimitMessage(error: unknown): Promise<string | null> {
  const context = (error as { context?: { json?: () => Promise<unknown> } })?.context;
  if (!context?.json) return null;
  try {
    const body = (await context.json()) as { code?: string; limit?: number };
    if (body?.code === 'ai_limit_reached') {
      return `You've used all ${body.limit ?? 10} free AI credits this month. Upgrade for more, or try again next month.`;
    }
  } catch {
    /* body wasn't the JSON we expected */
  }
  return null;
}
