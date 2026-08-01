import { supabase } from '@/lib/supabase';

/**
 * BayMo Automations (self-serve campaigns, Phase 2a — General only).
 * The wizard writes a `campaigns` row in status 'pending_review'; a DB trigger
 * notifies baymo_admins and another blocks non-admins from activating, so the
 * manual review gate holds no matter what the app sends.
 */

export type AutomationStatus = 'draft' | 'pending_review' | 'active' | 'paused' | 'completed';
export type AutomationScope = 'general' | 'project' | 'listing';

export type Automation = {
  id: string;
  name: string;
  status: AutomationStatus;
  scope: AutomationScope;
  isOrganicOwner: boolean;
  createdAt: string;
};

/** 3-slot model: 1 General + up to 2 Property/Project automations per client. */
export const MAX_AUTOMATIONS = 3;

export const SCOPE_OPTIONS = [
  {
    key: 'general' as const,
    label: 'Everything I sell',
    description: 'One assistant for all your properties. BayMo asks which one the lead means.',
  },
  {
    key: 'project' as const,
    label: 'One project',
    description: 'Focused on a single development — every lead from its ads is about this project.',
  },
  {
    key: 'listing' as const,
    label: 'One listing',
    description: 'Focused on one property you’re boosting.',
  },
];

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
  scope: AutomationScope;
  /** Project/listing name; listingId set when picked from the client's listings. */
  scopedTitle: string;
  listingId: string | null;
  /** Scoped only: how ad leads reach this automation. */
  adLinkMode: 'bamo_managed' | 'own_ad_id';
  fbAdId: string;
  /** Scoped only: claim organic/direct messages too (one owner per client). */
  organicOwner: boolean;
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
    .select('id, name, status, automation_scope, is_organic_owner, created_at')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status as AutomationStatus,
    scope: (c.automation_scope ?? 'general') as AutomationScope,
    isOrganicOwner: !!c.is_organic_owner,
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

  const isGeneral = draft.scope === 'general';
  const scopedRef = isGeneral
    ? null
    : {
        kind: draft.scope,
        title: draft.scopedTitle.trim(),
        listing_id: draft.listingId,
      };

  const { error } = await supabase.from('campaigns').insert({
    client_id: clientId,
    created_by: userId,
    name:
      draft.name.trim() ||
      (isGeneral ? 'My BayMo Assistant' : `BayMo — ${draft.scopedTitle.trim() || 'Property'}`),
    channel: 'facebook',
    status: 'pending_review',
    is_active: false,
    campaign_type: 'buyer_leadgen',
    automation_scope: draft.scope,
    scoped_ref: scopedRef,
    // General always owns organic traffic; a scoped automation only when the
    // client opted in (wizard enforces one owner per client; DB unique index backs it).
    is_organic_owner: isGeneral || draft.organicOwner,
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
        ad_link: isGeneral ? null : draft.adLinkMode,
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
      // Scoped automations claim leads via their ad; BaMo-managed ad IDs are
      // filled in by the admin at activation.
      ...(!isGeneral && draft.adLinkMode === 'own_ad_id' && draft.fbAdId.trim()
        ? { fb_ad_id: draft.fbAdId.trim() }
        : {}),
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

/* ---------------- Auto Follow-Up (Phase 4) ---------------- */

export type FollowupStyle = 'gentle' | 'standard' | 'persistent';
export type FollowupStatus = 'pending' | 'active' | 'rejected' | 'disabled';

export type FollowupRequest = {
  id: string;
  style: FollowupStyle;
  durationDays: number;
  status: FollowupStatus;
  adminNotes: string | null;
  createdAt: string;
};

export const FOLLOWUP_STYLES = [
  {
    key: 'gentle' as const,
    label: 'Gentle',
    description: 'A couple of soft check-ins. Low pressure, warm tone.',
  },
  {
    key: 'standard' as const,
    label: 'Standard (recommended)',
    description: 'Three well-timed touches: a nudge, a value message, a last call.',
  },
  {
    key: 'persistent' as const,
    label: 'Persistent',
    description: 'Up to five touches for high-intent leads. BayMo still respects quiet hours.',
  },
];

export const FOLLOWUP_DURATIONS = [7, 14, 30] as const;

export async function fetchLatestFollowupRequest(): Promise<FollowupRequest | null> {
  const { data, error } = await supabase
    .from('followup_requests')
    .select('id, style, duration_days, status, admin_notes, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    style: data.style as FollowupStyle,
    durationDays: data.duration_days,
    status: data.status as FollowupStatus,
    adminNotes: data.admin_notes,
    createdAt: data.created_at,
  };
}

export async function submitFollowupRequest(
  clientId: string,
  userId: string,
  input: { style: FollowupStyle; durationDays: number; notes?: string },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('followup_requests').insert({
    client_id: clientId,
    requested_by: userId,
    style: input.style,
    duration_days: input.durationDays,
    notes: input.notes?.trim() || null,
  });
  return { error: error ? error.message : null };
}

/* ------- Auto Follow-Up: per-campaign on/off (client-facing) -------
 *
 * The engine is one ai_adaptive sequence bound to a campaign, so follow-up is
 * a per-campaign switch rather than a workspace-wide setting.
 *
 * Asymmetric on purpose: turning it ON files a request for the BaMo team, who
 * set the touch ladder, goal and send window before anything sends. Turning it
 * OFF applies immediately through a SECURITY DEFINER RPC — a client who wants
 * automated messages to stop under their own name should not wait for a review.
 */

export type FollowupCampaignState = 'on' | 'off' | 'pending';

export type FollowupCampaign = {
  campaignId: string;
  name: string;
  state: FollowupCampaignState;
  /** Admin's note on the most recent rejected request, if any. */
  adminNotes: string | null;
};

export async function fetchFollowupCampaigns(): Promise<FollowupCampaign[]> {
  // Active campaigns only: the enrol scan skips anything else, so offering a
  // switch on a paused campaign would promise something that cannot happen.
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('id, name')
    .eq('status', 'active')
    .order('name');
  if (error || !campaigns?.length) return [];

  const ids = campaigns.map((c) => c.id);

  const [{ data: seqs }, { data: reqs }] = await Promise.all([
    supabase
      .from('sequences')
      .select('campaign_id, is_active')
      .eq('mode', 'ai_adaptive')
      .in('campaign_id', ids),
    supabase
      .from('followup_requests')
      .select('campaign_id, status, admin_notes, created_at')
      .in('campaign_id', ids)
      .order('created_at', { ascending: false }),
  ]);

  const activeByCampaign = new Map((seqs ?? []).map((s: any) => [s.campaign_id, !!s.is_active]));
  const pending = new Set(
    (reqs ?? []).filter((r: any) => r.status === 'pending').map((r: any) => r.campaign_id),
  );
  const latestNote = new Map<string, string | null>();
  for (const r of reqs ?? []) {
    if (!latestNote.has((r as any).campaign_id) && (r as any).status === 'rejected') {
      latestNote.set((r as any).campaign_id, (r as any).admin_notes ?? null);
    }
  }

  return campaigns.map((c) => ({
    campaignId: c.id,
    name: c.name,
    state: activeByCampaign.get(c.id) ? 'on' : pending.has(c.id) ? 'pending' : 'off',
    adminNotes: latestNote.get(c.id) ?? null,
  }));
}

/** Ask the BaMo team to switch follow-up on for a campaign. */
export async function requestFollowupEnable(
  clientId: string,
  userId: string,
  campaignId: string,
  notes?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('followup_requests').insert({
    client_id: clientId,
    requested_by: userId,
    campaign_id: campaignId,
    action: 'enable',
    notes: notes?.trim() || null,
  });
  // A unique index allows one pending request per campaign; a second tap is a
  // no-op rather than an error the client has to understand.
  if (error && /duplicate key/i.test(error.message)) return { error: null };
  return { error: error ? error.message : null };
}

/** Switch follow-up off immediately. Applies within the next engine tick. */
export async function disableFollowup(campaignId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('request_followup_disable', {
    p_campaign_id: campaignId,
  });
  if (error) return { error: error.message };
  if (data && (data as any).ok === false) {
    return { error: (data as any).reason === 'forbidden' ? 'Not allowed for this campaign.' : 'Could not switch off.' };
  }
  return { error: null };
}
