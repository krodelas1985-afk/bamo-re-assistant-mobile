import { supabase } from '@/lib/supabase';

/**
 * Settings section data layer.
 *
 * Profile edits write to the profiles table (self-update RLS already in
 * place). Workspace name goes through a security-definer RPC since clients
 * holds secrets and its RLS is admin-only. Account deletion is request-based
 * (not instant self-serve) — it cascades across leads/listings/appointments/
 * documents, so BaMo actions it manually, same shape as the other
 * subscription_requests flows.
 */

export async function fetchWorkspaceName(): Promise<string | null> {
  const { data } = await supabase.rpc('get_my_workspace_name');
  return (data as string) ?? null;
}

export type ProfileInput = {
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  prc_number: string | null;
  company: string | null;
  company_logo_url: string | null;
  whatsapp: string | null;
  location_province: string | null;
  location_city: string | null;
  service_area: string | null;
};

export async function updateProfile(
  userId: string,
  input: ProfileInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('profiles').update(input).eq('id', userId);
  return { error: error ? error.message : null };
}

/**
 * Upload a profile image (avatar or company logo) to the public `profile-media`
 * bucket; returns its public URL. RLS only allows writing under the caller's
 * own `{userId}/` folder. Timestamped names sidestep CDN caching of a reused path.
 */
export async function uploadProfileImage(
  userId: string,
  kind: 'avatar' | 'logo',
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
    const path = `${userId}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('profile-media')
      .upload(path, body, { contentType: mime, upsert: false });
    if (error) return { url: null, error: error.message };
    const { data } = supabase.storage.from('profile-media').getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (e) {
    return { url: null, error: String(e) };
  }
}

export async function changePassword(newPassword: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: error ? error.message : null };
}

export async function requestAccountDeletion(
  clientId: string,
  userId: string,
  note: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('subscription_requests').insert({
    client_id: clientId,
    created_by: userId,
    product: 'account_deletion',
    note,
  });
  return { error: error ? error.message : null };
}
