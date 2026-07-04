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

export async function updateProfile(
  userId: string,
  input: { full_name: string; phone: string | null },
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: input.full_name, phone: input.phone })
    .eq('id', userId);
  return { error: error ? error.message : null };
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
