import { supabase } from '@/lib/supabase';

export type MetaConnectionState = {
  connected: boolean;
  enabled: boolean;
  can_manage: boolean;
  reconnect_required: boolean;
  connection: {
    id: string;
    status: string;
    granted_scopes: string[];
    connected_at: string | null;
    token_expires_at: string | null;
    data_access_expires_at: string | null;
    revoked_at: string | null;
  } | null;
  page: {
    page_id: string;
    page_name: string;
    page_tasks: string[];
    subscription_status: string;
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
    cache: 'no-store',
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, Accept: 'application/json', ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as ({ error?: string } & T) | null;
  if (!response.ok) throw new Error(body?.error || 'Facebook connection could not be updated.');
  if (!body || typeof body !== 'object') throw new Error('Facebook returned an invalid response. Please refresh and try again.');
  return body as T;
}

export async function fetchMetaConnection(signal?: AbortSignal) {
  const state = await request<MetaConnectionState>('/api/auth/meta/connection', { signal });
  if (['connected', 'enabled', 'can_manage', 'reconnect_required'].some(key => typeof state[key as keyof MetaConnectionState] !== 'boolean')) {
    throw new Error('Facebook connection service needs an update. Please try again later.');
  }
  return state;
}

export function startMetaConnection() {
  return request<{ login_url: string; expires_at: string }>('/api/auth/meta/client-login?return_app=mobile', { method: 'POST' });
}

export function disconnectMetaConnection() {
  return request<{ disconnected: true }>('/api/auth/meta/connection', { method: 'DELETE' });
}
