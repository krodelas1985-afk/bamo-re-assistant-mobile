import { Session } from '@supabase/supabase-js';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { hasSubmittedOnboarding } from '@/lib/onboarding';
import { registerForPushNotifications, removeMyPushToken } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { needsWelcomeTour } from '@/lib/welcome-tour';

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
  /** true once we know the user must see the "Meet BayMo" welcome tour; null while resolving */
  needsTour: boolean | null;
  refreshWelcomeTour: () => Promise<void>;
  /**
   * Refetch the profile row and recompute the onboarding gate. Call after the user
   * edits their profile, and after anything that changes the row server-side — e.g.
   * submitting onboarding auto-provisions a workspace, so `client_id` has to be
   * pulled back into memory before the gate can resolve correctly.
   */
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /**
   * Create a new account. Returns `needsVerification: true` when Supabase requires
   * an email OTP before a session exists; `false` means the session is already live
   * (email confirmations disabled on the project) and <Redirect> takes over.
   */
  signUp: (params: {
    fullName: string;
    email: string;
    password: string;
  }) => Promise<{ error: string | null; needsVerification: boolean }>;
  /** Verify the 6-digit email code from signup; on success a session is established. */
  verifyEmailOtp: (email: string, token: string) => Promise<{ error: string | null }>;
  /** Re-send the signup confirmation code. */
  resendEmailOtp: (email: string) => Promise<{ error: string | null }>;
  /** Send a password-reset code to the email (recovery OTP). */
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  /** Verify the recovery code; on success a session is established so the password can be set. */
  verifyRecoveryOtp: (email: string, token: string) => Promise<{ error: string | null }>;
  /** Set a new password for the currently-authenticated (recovery) session. */
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const [needsTour, setNeedsTour] = useState<boolean | null>(null);

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
      setNeedsTour(null);
      return;
    }
    let cancelled = false;
    fetchProfile(session.user.id).then(async (prof) => {
      if (cancelled) return;
      setProfile(prof);
      setNeedsOnboarding(await resolveNeedsOnboarding(session.user.id, prof));
      if (cancelled) return;
      setNeedsTour(await resolveNeedsTour(session.user.id, prof));
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

  const refreshWelcomeTour = async () => {
    if (!session?.user) return;
    setNeedsTour(await resolveNeedsTour(session.user.id, profile));
  };

  const refreshProfile = async () => {
    if (!session?.user) return;
    const prof = await fetchProfile(session.user.id);
    setProfile(prof);
    setNeedsOnboarding(await resolveNeedsOnboarding(session.user.id, prof));
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error ? error.message : null };
  };

  const signUp: AuthState['signUp'] = async ({ fullName, email, password }) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Consumed by the handle_new_user() trigger. role is a request, not a
        // grant — the trigger whitelists it and never honors baymo_admin.
        data: { full_name: fullName.trim(), role: 'client_admin', signup_source: 'mobile_app' },
      },
    });
    if (error) return { error: error.message, needsVerification: false };
    // Session present => email confirmations are off; user is already signed in.
    return { error: null, needsVerification: !data.session };
  };

  const verifyEmailOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'signup',
    });
    return { error: error ? error.message : null };
  };

  const resendEmailOtp = async (email: string) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    return { error: error ? error.message : null };
  };

  const requestPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    return { error: error ? error.message : null };
  };

  const verifyRecoveryOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'recovery',
    });
    return { error: error ? error.message : null };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error ? error.message : null };
  };

  const signOut = async () => {
    await removeMyPushToken(); // drop this device's token while still authenticated
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        needsOnboarding,
        refreshOnboarding,
        needsTour,
        refreshWelcomeTour,
        refreshProfile,
        signIn,
        signUp,
        verifyEmailOtp,
        resendEmailOtp,
        requestPasswordReset,
        verifyRecoveryOtp,
        updatePassword,
        signOut,
      }}>
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

/**
 * Welcome-tour gate: runs for EVERY first-time user, provisioned or not —
 * except BaMo staff. A missing profile row means admin/testing; don't trap.
 */
async function resolveNeedsTour(userId: string, profile: Profile | null): Promise<boolean> {
  if (!profile) return false;
  if (profile.role === 'baymo_admin') return false;
  return needsWelcomeTour(userId, profile.role);
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
