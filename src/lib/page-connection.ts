import { supabase } from '@/lib/supabase';

/**
 * Guided "Connect my Facebook Page" requests (self-serve automations Phase 1).
 * Self-serve FB OAuth is blocked on Meta review, so the client requests the
 * connection and a BaMo admin wires the webhook manually. Rows live in
 * `page_connection_requests`; inserts notify all baymo_admins via trigger.
 */
export type PageConnectionStatus = 'pending' | 'in_progress' | 'connected' | 'rejected';

export type PageConnectionRequest = {
  id: string;
  pageName: string;
  pageUrl: string | null;
  status: PageConnectionStatus;
  adminNotes: string | null;
  createdAt: string;
};

/** Latest request for the user's workspace, or null if none was ever made. */
export async function fetchLatestPageConnectionRequest(): Promise<PageConnectionRequest | null> {
  const { data, error } = await supabase
    .from('page_connection_requests')
    .select('id, page_name, page_url, status, admin_notes, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    pageName: data.page_name,
    pageUrl: data.page_url,
    status: data.status as PageConnectionStatus,
    adminNotes: data.admin_notes,
    createdAt: data.created_at,
  };
}

export async function submitPageConnectionRequest(
  clientId: string,
  userId: string,
  input: { pageName: string; pageUrl?: string | null },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('page_connection_requests').insert({
    client_id: clientId,
    requested_by: userId,
    page_name: input.pageName.trim(),
    page_url: input.pageUrl?.trim() || null,
  });
  return { error: error ? error.message : null };
}
