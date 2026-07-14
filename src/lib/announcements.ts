import { supabase } from '@/lib/supabase';

/**
 * Announcements — read-only in the mobile app. RLS returns platform-wide
 * ('baymo' scope) rows plus the caller's own client's rows; authoring lives
 * in the CRM (baymo_admin: any; client_admin: own client only).
 */

export type Announcement = {
  id: string;
  scope: 'baymo' | 'client';
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
};

/** Active announcements: unexpired, pinned first, then newest. */
export async function fetchAnnouncements(limit = 5): Promise<Announcement[]> {
  const { data } = await supabase
    .from('announcements')
    .select('id, scope, title, body, pinned, created_at')
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as Announcement[]) ?? [];
}
