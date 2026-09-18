import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';

import { Usage, fetchUsage } from '@/lib/usage';

/**
 * Loads the current workspace's plan usage (get_my_usage) for proactive gating —
 * showing "3 of 3 listings" banners and disabling create buttons at the cap.
 * Enforcement is authoritative in the DB; this is UX only.
 */
export function useUsage() {
  const { profile } = useAuth();
  const clientId = profile?.client_id ?? null;
  const pending = useRef(0);
  const [state, setState] = useState<{ clientId: string | null; usage: Usage | null } | null>(null);

  const refresh = useCallback(async () => {
    const request = ++pending.current;
    const { data } = await fetchUsage();
    if (request === pending.current) setState({ clientId, usage: data });
  }, [clientId]);

  // Initial load. setState lives in the promise callback (not synchronously in
  // the effect body) so it doesn't trigger cascading renders.
  useFocusEffect(useCallback(() => {
    void refresh();
    return () => {
      pending.current++;
    };
  }, [refresh]));

  return { usage: state?.clientId === clientId ? state.usage : null, loading: state?.clientId !== clientId, refresh };
}
