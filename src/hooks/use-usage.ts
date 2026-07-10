import { useCallback, useEffect, useState } from 'react';

import { Usage, fetchUsage } from '@/lib/usage';

/**
 * Loads the current workspace's plan usage (get_my_usage) for proactive gating —
 * showing "3 of 3 listings" banners and disabling create buttons at the cap.
 * Enforcement is authoritative in the DB; this is UX only.
 */
export function useUsage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchUsage();
    setUsage(data);
    setLoading(false);
  }, []);

  // Initial load. setState lives in the promise callback (not synchronously in
  // the effect body) so it doesn't trigger cascading renders.
  useEffect(() => {
    let cancelled = false;
    fetchUsage().then(({ data }) => {
      if (cancelled) return;
      setUsage(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { usage, loading, refresh };
}
