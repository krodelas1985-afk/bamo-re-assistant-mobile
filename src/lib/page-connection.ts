import { supabase } from '@/lib/supabase';

export type MetaConnectionState = {
  connected: boolean;
  connection: {
    id: string;
    status: string;
    granted_scopes: string[];
    connected_at: string | null;
    last_verified_at: string | null;
    revoked_at: string | null;
  } | null;
  page: {
    page_id: string;
    page_name: string;
    page_tasks: string[];
    subscribed_fields: string[];
    subscription_status: string;
    connected_at: string | null;
    last_verified_at: string | null;
  } | null;
};

function apiUrl(path: string) {
  const base = process.env.EXPO_PUBLIC_ADS_MANAGER_URL?.replace(/\/$/, '');
  if (!base) throw new Error('Facebook connection is not configured in this app build.');
  return `${base}${path}`;
}

async function accessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Your session expired. Please sign in again.');
  return data.session.access_token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, Accept: 'application/json', ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as ({ error?: string } & T) | null;
  if (!response.ok) throw new Error(body?.error || 'Facebook connection could not be updated.');
  return body as T;
}

export function fetchMetaConnection() {
  return request<MetaConnectionState>('/api/auth/meta/connection');
}

export function startMetaConnection() {
  return request<{ login_url: string; expires_at: string }>('/api/auth/meta/client-login', { method: 'POST' });
}

export function disconnectMetaConnection() {
  return request<{ disconnected: true; unsubscribe_verified: boolean }>('/api/auth/meta/connection', { method: 'DELETE' });
}
