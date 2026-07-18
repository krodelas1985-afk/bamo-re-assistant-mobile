import { Session } from '@supabase/supabase-js';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { hasSubmittedOnboarding } from '@/lib/onboarding';
import { registerForPushNotifications, removeMyPushToken } from '@/lib/push';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  client_id: string | null;
  is_active: boolean | null;
  avatar_url: string | null;
  prc_number: string | null;
  company: string | null;
  company_logo_url: string | null;
  whatsapp: string | null;
  location_province: string | null;
  location_city: string | null;
  service_area: string | null;
};

const PROFILE_COLUMNS =
  'id, full_name, email, phone, role, client_id, is_active, avatar_url, prc_number, company, company_logo_url, whatsapp, location_province, location_city, service_area';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  /** true until the persisted session has been restored (prevents redirect flicker) */
  loading: boolean;
  /** true once we know the user must complete onboarding; null while still resolving */
  needsOnboarding: boolean | null;
  refreshOnboarding: () => Promise<void>;
  /** Refetch the profile row (e.g. after the user edits it on the Profile screen). */
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setNeedsOnboarding(null);
      return;
    }
    let cancelled = false;
    fetchProfile(session.user.id).then(async (prof) => {
      if (cancelled) return;
      setProfile(prof);
      setNeedsOnboarding(await resolveNeedsOnboarding(session.user.id, prof));
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  // Register this device for push once we have an authenticated user.
  useEffect(() => {
    if (session?.user?.id) registerForPushNotifications(session.user.id);
  }, [session?.user?.id]);

  const refreshOnboarding = async () => {
    if (!session?.user) return;
    setNeedsOnboarding(await resolveNeedsOnboarding(session.user.id, profile));
  };

  const refreshProfile = async () => {
    if (!session?.user) return;
    setProfile(await fetchProfile(session.user.id));
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error ? error.message : null };
  };

  const signOut = async () => {
    await removeMyPushToken(); // drop this device's token while still authenticated
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, needsOnboarding, refreshOnboarding, refreshProfile, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();
  return (data as Profile) ?? null;
}

/**
 * Onboarding gate: BaMo admins and already-provisioned users (client_id set) never
 * onboard. Everyone else needs it until they have a submitted/approved row.
 */
async function resolveNeedsOnboarding(userId: string, profile: Profile | null): Promise<boolean> {
  if (!profile) return false; // no profile row (admin/testing) — don't trap
  if (profile.role === 'baymo_admin') return false;
  if (profile.client_id) return false;
  return !(await hasSubmittedOnboarding(userId));
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
