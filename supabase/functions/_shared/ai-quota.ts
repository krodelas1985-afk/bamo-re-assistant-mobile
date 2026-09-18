type QuotaClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

/** Spend a generation credit using the existing atomic workspace quota. */
export async function checkAiQuota(admin: QuotaClient, clientId: string | null) {
  if (!clientId) return null;
  try {
    const { data, error } = await admin.rpc('consume_ai_credit', { p_client_id: clientId });
    const credit = data as { allowed?: boolean; used?: number; limit?: number; reason?: string } | null;
    if (error || typeof credit?.allowed !== 'boolean') {
      return { status: 503, body: { error: 'Could not check AI usage. Please try again.' } };
    }
    if (!credit.allowed) {
      if (credit.reason === 'no_client') return { status: 403, body: { error: 'Your workspace is not available.' } };
      return { status: 402, body: { error: 'AI limit reached', code: 'ai_limit_reached', used: credit.used, limit: credit.limit } };
    }
    return null;
  } catch {
    return { status: 503, body: { error: 'Could not check AI usage. Please try again.' } };
  }
}
