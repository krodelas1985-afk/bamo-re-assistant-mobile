import { supabase } from '@/lib/supabase';

/**
 * BayMo Automations (self-serve campaigns, Phase 2a — General only).
 * The wizard writes a `campaigns` row in status 'pending_review'; a DB trigger
 * notifies baymo_admins and another blocks non-admins from activating, so the
 * manual review gate holds no matter what the app sends.
 */

export type AutomationStatus = 'draft' | 'pending_review' | 'active' | 'paused' | 'completed';

export type Automation = {
  id: string;
  name: string;
  status: AutomationStatus;
  scope: 'general' | 'project' | 'listing';
  createdAt: string;
};

/** Goal presets → the free-text target_action W2 reads as the AI's objective. */
export const AUTOMATION_GOALS = [
  {
    key: 'qualify',
    label: 'Qualify my leads',
    description: 'BayMo asks smart questions to find the serious buyers.',
    targetAction:
      'Pre-qualify the leads: ask the configured qualifying questions to gauge the seriousness of the buyer.',
  },
  {
    key: 'appointment',
    label: 'Book phone appointments',
    description: 'BayMo qualifies, then asks for the best time to call.',
    targetAction:
      'Qualify the lead, then set a phone appointment: ask for the best time and number for a call.',
  },
  {
    key: 'viewing',
    label: 'Book property viewings',
    description: 'BayMo qualifies, then schedules a viewing.',
    targetAction:
      'Qualify the lead, then schedule a property viewing. Only ask for a viewing schedule after at least 3 qualification questions were answered.',
  },
] as const;

export type GoalKey = (typeof AUTOMATION_GOALS)[number]['key'];

export const AUTOMATION_TONES = ['Friendly', 'Professional', 'Casual Taglish'] as const;

/** Qualifying-question library (field keys W2/W1 already understand). */
export const QUAL_LIBRARY = [
  { field: 'budget', label: 'Budget', question: 'May budget range po ba kayo?' },
  { field: 'timeframe', label: 'Buying timeline', question: 'Kailan nyo po balak mag-avail? May timeline po ba kayo?' },
  { field: 'preferred_location', label: 'Preferred location', question: 'Saan po ang preferred location ninyo?' },
  { field: 'property_type', label: 'Property type', question: 'Anong property type po ang hinahanap ninyo?' },
  { field: 'payment_scheme', label: 'Payment scheme', question: 'Cash, bank financing, o Pag-IBIG po?' },
  { field: 'phone', label: 'Contact number', question: 'Ano po ang best contact number ninyo?' },
  { field: 'purpose', label: 'Purpose of purchase', question: 'Para po ba ito sa sariling tirahan o investment?' },
  { field: 'current_location', label: 'Current location', question: 'Saan po kayo currently located?' },
] as const;

export const MAX_QUAL_QUESTIONS = 5;

/** Coverage presets → campaign_rules.sending_hours_start/end (Manila time). */
export const TIME_WINDOWS = [
  {
    key: 'always',
    label: '24/7 (recommended)',
    description: 'BayMo answers day and night — never miss a lead.',
    start: '00:00',
    end: '23:59',
  },
  {
    key: 'overnight',
    label: 'While I sleep',
    description: 'BayMo covers 8PM–8AM; you handle the day.',
    start: '20:00',
    end: '07:59',
  },
  {
    key: 'business',
    label: 'Business hours',
    description: 'BayMo covers 8AM–8PM; quiet overnight.',
    start: '08:00',
    end: '19:59',
  },
] as const;

export type AutomationDraft = {
  goal: GoalKey;
  tone: string;
  personaNotes: string;
  /** Enabled library field keys, in order. */
  questions: string[];
  customQuestion: string;
  windowKey: (typeof TIME_WINDOWS)[number]['key'];
  enrollExisting: boolean;
  sources: string[]; // 'messenger' | 'webform' | 'website'
  name: string;
};

export async function fetchMyAutomations(): Promise<Automation[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, name, status, automation_scope, created_at')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status as AutomationStatus,
    scope: (c.automation_scope ?? 'general') as Automation['scope'],
    createdAt: c.created_at,
  }));
}

/** Client-shared knowledge sources BayMo can answer from (completeness meter). */
export async function fetchKbSourceCount(): Promise<number> {
  const { count, error } = await supabase
    .from('campaign_knowledge_base')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);
  if (error) return 0;
  return count ?? 0;
}

export async function submitAutomation(
  clientId: string,
  userId: string,
  draft: AutomationDraft,
): Promise<{ error: string | null }> {
  const goal = AUTOMATION_GOALS.find((g) => g.key === draft.goal)!;
  const window = TIME_WINDOWS.find((w) => w.key === draft.windowKey)!;

  const qualificationFields = QUAL_LIBRARY.map((q) => ({
    field: q.field,
    label: q.label,
    enabled: draft.questions.includes(q.field),
    question: q.question,
  })) as { field: string; label: string; enabled: boolean; question: string }[];
  if (draft.customQuestion.trim()) {
    qualificationFields.push({
      field: 'custom',
      label: 'Custom question',
      enabled: true,
      question: draft.customQuestion.trim(),
    });
  }

  const { error } = await supabase.from('campaigns').insert({
    client_id: clientId,
    created_by: userId,
    name: draft.name.trim() || 'My BayMo Assistant',
    channel: 'facebook',
    status: 'pending_review',
    is_active: false,
    campaign_type: 'buyer_leadgen',
    automation_scope: 'general',
    is_organic_owner: true,
    target_action: goal.targetAction,
    tone: draft.tone,
    conversational_ai_enabled: true,
    scheduled_steps_enabled: false,
    config: {
      tone_persona: draft.personaNotes.trim(),
      qualification_fields: qualificationFields,
      // Wizard metadata the admin review queue reads; not consumed by W2.
      selfserve: {
        goal: draft.goal,
        window: draft.windowKey,
        enroll_existing: draft.enrollExisting,
        requested_sources: draft.sources,
        submitted_at: new Date().toISOString(),
      },
    },
    campaign_rules: {
      dos: [],
      donts: [],
      language: draft.tone === 'Professional' ? 'English' : 'Taglish',
      temperature_rules: {},
      sending_hours_start: window.start,
      sending_hours_end: window.end,
    },
    enrollment_rules: {
      sources: draft.sources,
      new_leads_only: true,
      skip_if_active_campaign: true,
    },
  });

  if (error) {
    if (error.message.includes('campaigns_one_organic_owner_per_client')) {
      return {
        error:
          'You already have an automation that answers your direct messages. Ask the BaMo team if you want to replace it.',
      };
    }
    return { error: error.message };
  }
  return { error: null };
}
