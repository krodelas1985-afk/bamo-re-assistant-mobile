import { supabase } from '@/lib/supabase';

export type BusinessType = 'agent' | 'broker' | 'developer';

/** Free-form answers captured across the wizard, stored in the `answers` jsonb column. */
export type OnboardingAnswers = {
  areas_served?: string;
  property_types?: string[];
  primary_goal?: string;
  lead_sources?: string[];
};

export type Onboarding = {
  id: string;
  profile_id: string;
  status: string; // 'in_progress' | 'submitted' | 'approved' | ...
  current_step: number;
  business_type: BusinessType | null;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  answers: OnboardingAnswers | null;
};

const COLUMNS =
  'id, profile_id, status, current_step, business_type, full_name, company_name, email, phone, answers';

/**
 * Returns the user's active onboarding row, creating an `in_progress` one if none
 * exists. Respects RLS: own_insert requires profile_id = auth.uid().
 */
export async function loadOrCreateOnboarding(
  profileId: string,
  seed: { full_name?: string | null; email?: string | null },
): Promise<{ data: Onboarding | null; error: string | null }> {
  const existing = await supabase
    .from('client_onboarding')
    .select(COLUMNS)
    .eq('profile_id', profileId)
    .in('status', ['in_progress'])
    .order('created_at', { ascending: false })
    .maybeSingle();

  if (existing.error) return { data: null, error: existing.error.message };
  if (existing.data) return { data: existing.data as Onboarding, error: null };

  const created = await supabase
    .from('client_onboarding')
    .insert({
      profile_id: profileId,
      source: 'mobile_app',
      status: 'in_progress',
      current_step: 1,
      full_name: seed.full_name ?? null,
      email: seed.email ?? null,
      answers: {},
    })
    .select(COLUMNS)
    .single();

  if (created.error) return { data: null, error: created.error.message };
  return { data: created.data as Onboarding, error: null };
}

/** Persists partial progress. Only allowed while status = 'in_progress' (RLS own_update). */
export async function saveOnboardingStep(
  id: string,
  patch: Partial<Omit<Onboarding, 'id' | 'profile_id' | 'status'>>,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('client_onboarding')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error: error ? error.message : null };
}

/** Finalizes onboarding: status -> submitted. USING(status='in_progress') still passes on the old row. */
export async function submitOnboarding(
  id: string,
  finalPatch: Partial<Omit<Onboarding, 'id' | 'profile_id' | 'status'>>,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('client_onboarding')
    .update({
      ...finalPatch,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  return { error: error ? error.message : null };
}

/** True if the profile still needs onboarding (unprovisioned, non-admin, nothing submitted). */
export async function hasSubmittedOnboarding(profileId: string): Promise<boolean> {
  const { data } = await supabase
    .from('client_onboarding')
    .select('id')
    .eq('profile_id', profileId)
    .in('status', ['submitted', 'approved'])
    .limit(1)
    .maybeSingle();
  return !!data;
}
