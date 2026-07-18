import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * "Meet BayMo" welcome tour state (user_onboarding_tour table).
 * Separate from the client_onboarding intake wizard: the tour runs for every
 * first-time user, including admin-provisioned ones. baymo_admin never sees it.
 * Plan of record: bamo-ops/BaMo_Welcome_Onboarding_Plan.md
 */

export type TourStepStatus = 'done' | 'skipped';
export type TourSteps = Record<string, { status: TourStepStatus; at: string }>;

const isBrowser = typeof window !== 'undefined';
const cacheKey = (profileId: string) => `bamo.welcomeTourDone.${profileId}`;

// Same SSR-safe pattern as lib/supabase.ts: Expo web statically renders in
// Node, where window/AsyncStorage's shim don't exist.
async function getCached(profileId: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      return isBrowser ? window.localStorage.getItem(cacheKey(profileId)) === '1' : false;
    }
    return (await AsyncStorage.getItem(cacheKey(profileId))) === '1';
  } catch {
    return false;
  }
}

async function setCached(profileId: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (isBrowser) window.localStorage.setItem(cacheKey(profileId), '1');
      return;
    }
    await AsyncStorage.setItem(cacheKey(profileId), '1');
  } catch {
    // Cache only — the DB row is the source of truth.
  }
}

/**
 * True if this user still needs the welcome tour. Fast-paths through the local
 * cache so returning users never wait on (or flash from) the DB check; a cache
 * miss (fresh install) falls back to the DB row.
 */
export async function needsWelcomeTour(profileId: string, role: string | null): Promise<boolean> {
  if (role === 'baymo_admin') return false;
  if (await getCached(profileId)) return false;

  const { data, error } = await supabase
    .from('user_onboarding_tour')
    .select('completed_at')
    .eq('profile_id', profileId)
    .maybeSingle();

  // On error, let the user through rather than trapping them in the tour.
  if (error) return false;
  if (data?.completed_at) {
    await setCached(profileId);
    return false;
  }
  return true;
}

/** Ensures a started row exists (first mount). Safe to call repeatedly. */
export async function startWelcomeTour(profileId: string): Promise<void> {
  // profile_id/client_id are forced server-side by the guard trigger.
  await supabase
    .from('user_onboarding_tour')
    .upsert({ profile_id: profileId }, { onConflict: 'profile_id', ignoreDuplicates: true });
}

/**
 * Finalizes the tour. Setting completed_at fires the DB trigger that notifies
 * BaMo staff and the user's own workspace admins with the sales signal.
 */
export async function completeWelcomeTour(
  profileId: string,
  outcome: {
    skipped: boolean;
    steps: TourSteps;
    services_needed: string[];
    help_request: string | null;
    listing_intent: boolean;
  },
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('user_onboarding_tour')
    .upsert(
      { profile_id: profileId, ...outcome, completed_at: new Date().toISOString() },
      { onConflict: 'profile_id' },
    );
  if (!error) await setCached(profileId);
  return { error: error ? error.message : null };
}
