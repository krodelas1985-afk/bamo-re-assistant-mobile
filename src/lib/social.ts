import { supabase } from '@/lib/supabase';

/**
 * Social Media section data layer.
 *
 * Reads/writes the shared Ads Manager tables directly under RLS:
 *  - ad_posts       — drafts/scheduled/published posts. Autopost drafts carry
 *                     source='autopost'; approving one flips it to 'scheduled'
 *                     and the existing n8n 15-min scheduler publishes it.
 *  - social_autopost_plans — the 1-month BaMo Auto-Posting subscription.
 *  - video_requests        — BaMo-fulfilled video production requests.
 *  - subscription_requests — "subscribe to activate" / "connect my page" CTAs.
 *
 * clients and ad_social_accounts rows hold secrets (tokens/api keys), so the
 * paid-plan gate and FB page panel go through security-definer RPCs that
 * return only safe columns: get_my_ads_plan() / get_my_social_pages().
 */

export type AdsPlanInfo = {
  ads_plan: string | null;
  ads_plan_started_at: string | null;
  ads_enabled: boolean | null;
  is_active: boolean | null;
};

export type SocialPage = {
  platform: string;
  account_name: string | null;
  is_active: boolean | null;
};

export type AutopostTopic =
  | 'listing'
  | 'house_tour'
  | 'open_house'
  | 'agent_info'
  | 'property_info'
  | 'viewing_invitation'
  | 're_info'
  | 'others';

export type WeeklyTopic = {
  week: 1 | 2 | 3 | 4;
  topic: AutopostTopic;
  details: {
    listing_id?: string | null;
    notes?: string | null;
    date?: string | null;
    time?: string | null;
    venue?: string | null;
  };
};

export type AutopostPlan = {
  id: string;
  status: 'active' | 'paused' | 'expired' | 'cancelled';
  starts_at: string;
  ends_at: string;
  weekly_topics: WeeklyTopic[];
  created_at: string;
};

export type AdPost = {
  id: string;
  platform: string;
  post_type: string | null;
  message: string | null;
  media_urls: string[] | null;
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
  source: 'manual' | 'autopost';
  scheduled_at: string | null;
  published_at: string | null;
  error_message: string | null;
  created_at: string;
};

export type VideoRequest = {
  id: string;
  video_type: string;
  duration_seconds: number;
  format: string;
  status: 'requested' | 'in_production' | 'delivered' | 'cancelled';
  delivered_url: string | null;
  created_at: string;
};

/**
 * v1 paid-plan rule: BaMo flips clients.ads_enabled on when the client
 * subscribes. Tier mapping (starter/growth/pro) is TBD — when decided, this
 * is the one place to change.
 */
export function isPaidPlan(info: AdsPlanInfo | null): boolean {
  return !!info && info.is_active !== false && info.ads_enabled === true;
}

export async function fetchAdsPlan(): Promise<AdsPlanInfo | null> {
  const { data } = await supabase.rpc('get_my_ads_plan');
  return (data?.[0] as AdsPlanInfo) ?? null;
}

export async function fetchSocialPages(): Promise<SocialPage[]> {
  const { data } = await supabase.rpc('get_my_social_pages');
  return (data as SocialPage[]) ?? [];
}

/** Latest autopost plan for the workspace (any status), or null. */
export async function fetchAutopostPlan(): Promise<AutopostPlan | null> {
  const { data } = await supabase
    .from('social_autopost_plans')
    .select('id, status, starts_at, ends_at, weekly_topics, created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  return (data?.[0] as AutopostPlan) ?? null;
}

export async function activateAutopost(
  clientId: string,
  userId: string,
  weeklyTopics: WeeklyTopic[],
): Promise<{ error: string | null }> {
  const ends = new Date();
  ends.setMonth(ends.getMonth() + 1);
  const { error } = await supabase.from('social_autopost_plans').insert({
    client_id: clientId,
    created_by: userId,
    status: 'active',
    ends_at: ends.toISOString(),
    weekly_topics: weeklyTopics,
  });
  return { error: error ? error.message : null };
}

/** Deactivate the plan and cancel its not-yet-published posts (best effort). */
export async function deactivateAutopost(planId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('social_autopost_plans')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', planId);
  if (error) return { error: error.message };
  await supabase
    .from('ad_posts')
    .update({ status: 'cancelled' })
    .eq('source', 'autopost')
    .in('status', ['draft', 'scheduled']);
  return { error: null };
}

const POST_SELECT =
  'id, platform, post_type, message, media_urls, status, source, scheduled_at, published_at, error_message, created_at';

/** Autopost drafts awaiting the agent's approval. */
export async function fetchApprovals(): Promise<AdPost[]> {
  const { data } = await supabase
    .from('ad_posts')
    .select(POST_SELECT)
    .eq('source', 'autopost')
    .eq('status', 'draft')
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .limit(20);
  return (data as AdPost[]) ?? [];
}

/**
 * Approve an autopost draft: flip to 'scheduled' so the existing 15-min n8n
 * scheduler publishes it. Keeps the proposed slot; defaults to +1h if unset.
 */
export async function approvePost(post: AdPost, editedMessage?: string): Promise<{ error: string | null }> {
  const scheduledAt =
    post.scheduled_at && new Date(post.scheduled_at).getTime() > Date.now()
      ? post.scheduled_at
      : new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const patch: Record<string, unknown> = { status: 'scheduled', scheduled_at: scheduledAt };
  if (editedMessage !== undefined) patch.message = editedMessage;
  const { error } = await supabase.from('ad_posts').update(patch).eq('id', post.id).eq('status', 'draft');
  return { error: error ? error.message : null };
}

export async function skipPost(postId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('ad_posts')
    .update({ status: 'cancelled' })
    .eq('id', postId)
    .eq('status', 'draft');
  return { error: error ? error.message : null };
}

export async function fetchUpcomingPosts(): Promise<AdPost[]> {
  const { data } = await supabase
    .from('ad_posts')
    .select(POST_SELECT)
    .eq('status', 'scheduled')
    .order('scheduled_at', { ascending: true })
    .limit(20);
  return (data as AdPost[]) ?? [];
}

export async function fetchPostHistory(): Promise<AdPost[]> {
  const { data } = await supabase
    .from('ad_posts')
    .select(POST_SELECT)
    .in('status', ['published', 'failed'])
    .order('created_at', { ascending: false })
    .limit(20);
  return (data as AdPost[]) ?? [];
}

/** One-off composed post (facebook only, like the web v1). */
export async function createPost(
  clientId: string,
  userId: string,
  input: { message: string; action: 'draft' | 'schedule'; scheduled_at?: string | null },
): Promise<{ error: string | null }> {
  if (input.action === 'schedule') {
    if (!input.scheduled_at || new Date(input.scheduled_at).getTime() <= Date.now()) {
      return { error: 'Schedule time must be in the future.' };
    }
  }
  const { error } = await supabase.from('ad_posts').insert({
    client_id: clientId,
    created_by: userId,
    platform: 'facebook',
    post_type: 'feed',
    message: input.message,
    status: input.action === 'schedule' ? 'scheduled' : 'draft',
    scheduled_at: input.action === 'schedule' ? input.scheduled_at : null,
    source: 'manual',
  });
  return { error: error ? error.message : null };
}

export type GeneratedPost = {
  content_id: string;
  title: string | null;
  hook: string | null;
  caption: string;
  hashtags: string[];
  cta: string | null;
};

/** AI caption via the generate-post-content edge function (saves to ad_content). */
export async function generatePostContent(input: {
  goal: string;
  tone: string;
  language: string;
  listing_id?: string | null;
  instructions?: string | null;
}): Promise<{ data: GeneratedPost | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('generate-post-content', { body: input });
  if (error) return { data: null, error: error.message };
  if (data?.error) return { data: null, error: String(data.error) };
  return { data: data as GeneratedPost, error: null };
}

export async function fetchVideoRequests(): Promise<VideoRequest[]> {
  const { data } = await supabase
    .from('video_requests')
    .select('id, video_type, duration_seconds, format, status, delivered_url, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  return (data as VideoRequest[]) ?? [];
}

export async function submitVideoRequest(
  clientId: string,
  userId: string,
  input: {
    video_type: string;
    duration_seconds: number;
    format: string;
    listing_id?: string | null;
    notes?: string | null;
  },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('video_requests').insert({
    client_id: clientId,
    created_by: userId,
    ...input,
  });
  return { error: error ? error.message : null };
}

/** File a subscribe/connect request the BaMo team follows up off-app. */
export async function submitSubscriptionRequest(
  clientId: string,
  userId: string,
  product: 'social_autopost' | 'fb_page_connection',
  note?: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('subscription_requests').insert({
    client_id: clientId,
    created_by: userId,
    product,
    note: note ?? null,
  });
  return { error: error ? error.message : null };
}

export const TOPIC_OPTIONS: { value: AutopostTopic; label: string }[] = [
  { value: 'listing', label: 'Listing' },
  { value: 'house_tour', label: 'House Tour' },
  { value: 'open_house', label: 'Open House' },
  { value: 'agent_info', label: 'Agent Info' },
  { value: 'property_info', label: 'Property Info' },
  { value: 'viewing_invitation', label: 'Viewing Invitation' },
  { value: 're_info', label: 'Real Estate Info' },
  { value: 'others', label: 'Others' },
];

export function topicLabel(topic: AutopostTopic): string {
  return TOPIC_OPTIONS.find((t) => t.value === topic)?.label ?? topic;
}

export function postDateLabel(iso: string | null): string {
  if (!iso) return 'No date yet';
  const d = new Date(iso);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}
