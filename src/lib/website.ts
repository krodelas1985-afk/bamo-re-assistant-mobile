import { supabase } from '@/lib/supabase';

/**
 * Agent website requests + live-site management (table public.agent_websites).
 *
 * The app only *collects* the request and *reads* status. BaMo builds & deploys
 * the site manually, then flips status → 'live' and sets website_url — there is
 * no backend job. Post-live change requests (modify/delete) are filed into
 * public.agent_website_requests as a queue BaMo actions by hand.
 *
 * Storage: bulk assets are handed off via a Google Drive folder link (zero
 * Supabase storage). Only the single hero photo is uploaded — to the existing
 * public `client-assets` bucket — so the app has a real thumbnail to show.
 */

export type WebsiteStatus = 'requested' | 'building' | 'live' | 'archived';

export type Website = {
  id: string;
  status: WebsiteStatus;
  hero_photo_url: string | null;
  linked_listing_ids: string[];
  assets_drive_url: string | null;
  facts: string | null;
  agent_name: string | null;
  agent_phone: string | null;
  agent_email: string | null;
  prc_number: string | null;
  area_coverage: string | null;
  company: string | null;
  messenger_link: string | null;
  whatsapp_link: string | null;
  website_url: string | null;
  requested_at: string;
};

export type WebsiteInput = {
  hero_photo_url: string | null;
  linked_listing_ids: string[];
  assets_drive_url: string | null;
  facts: string | null;
  agent_name: string | null;
  agent_phone: string | null;
  agent_email: string | null;
  prc_number: string | null;
  area_coverage: string | null;
  company: string | null;
  messenger_link: string | null;
  whatsapp_link: string | null;
};

const SELECT =
  'id, status, hero_photo_url, linked_listing_ids, assets_drive_url, facts, agent_name, agent_phone, agent_email, prc_number, area_coverage, company, messenger_link, whatsapp_link, website_url, requested_at';

/**
 * The agent's current website row (RLS-scoped). Returns the most recent
 * non-archived one, or null if they've never requested a site.
 */
export async function fetchMyWebsite(): Promise<{ data: Website | null; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_websites')
    .select(SELECT)
    .neq('status', 'archived')
    .order('requested_at', { ascending: false })
    .limit(1);
  if (error) return { data: null, error: error.message };
  return { data: (data?.[0] as Website) ?? null, error: null };
}

export async function submitWebsiteRequest(
  clientId: string,
  userId: string,
  input: WebsiteInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('agent_websites')
    .insert({ ...input, client_id: clientId, created_by: userId, status: 'requested' });
  return { error: error ? error.message : null };
}

/** File a post-live change request (modify or delete). BaMo actions it manually. */
export async function fileWebsiteRequest(
  clientId: string,
  userId: string,
  websiteId: string,
  type: 'modify' | 'delete',
  note: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('agent_website_requests').insert({
    website_id: websiteId,
    client_id: clientId,
    created_by: userId,
    type,
    note,
  });
  return { error: error ? error.message : null };
}

/** Upload the single hero photo to the public `client-assets` bucket. */
export async function uploadHeroPhoto(
  clientId: string,
  asset: { uri: string; base64?: string | null; mimeType?: string | null },
): Promise<{ url: string | null; error: string | null }> {
  try {
    const mime = asset.mimeType || 'image/jpeg';
    let body: Uint8Array | ArrayBuffer;
    if (asset.base64) {
      const bin = atob(asset.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      body = bytes;
    } else {
      body = await (await fetch(asset.uri)).arrayBuffer();
    }
    const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    // First path segment must be the client_id — the client-assets bucket RLS keys on it.
    const path = `${clientId}/website-hero/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from('client-assets')
      .upload(path, body, { contentType: mime, upsert: false });
    if (error) return { url: null, error: error.message };
    const { data } = supabase.storage.from('client-assets').getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (e) {
    return { url: null, error: String(e) };
  }
}

/** Lightweight list of the agent's own listings for the "Link BaMo Listing" picker. */
export async function fetchListingOptions(): Promise<{ id: string; title: string }[]> {
  const { data } = await supabase
    .from('agent_listings')
    .select('id, title')
    .order('created_at', { ascending: false })
    .limit(100);
  return (data as { id: string; title: string }[]) ?? [];
}
