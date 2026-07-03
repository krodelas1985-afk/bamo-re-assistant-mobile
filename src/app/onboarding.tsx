import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TagPill } from '@/components/ui/tag-pill';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/contexts/auth-context';
import {
  BusinessType,
  Onboarding,
  OnboardingAnswers,
  loadOrCreateOnboarding,
  saveOnboardingStep,
  submitOnboarding,
} from '@/lib/onboarding';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

const baymoAvatar = require('../../assets/brand/baymo.png');

const BUSINESS_TYPES: { value: BusinessType; label: string; sub: string }[] = [
  { value: 'agent', label: 'Solo Agent', sub: 'I sell on my own' },
  { value: 'broker', label: 'Broker', sub: 'I have a team of agents' },
  { value: 'developer', label: 'Developer', sub: 'I sell my own projects' },
];
const PROPERTY_TYPES = ['House & Lot', 'Condo', 'Townhouse', 'Lot Only', 'Commercial'];
const GOALS = ['More leads', 'Faster follow-ups', 'Online presence', 'Manage my team'];
const LEAD_SOURCES = ['Facebook / Messenger', 'Marketplace', 'Referrals', 'Walk-ins', 'Other'];

const TOTAL_STEPS = 5;

export default function OnboardingScreen() {
  const router = useRouter();
  const { profile, session, refreshOnboarding } = useAuth();
  const [record, setRecord] = useState<Onboarding | null>(null);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [areasServed, setAreasServed] = useState('');
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [goal, setGoal] = useState<string | null>(null);
  const [leadSources, setLeadSources] = useState<string[]>([]);

  const profileId = session?.user.id;

  useEffect(() => {
    if (!profileId) return;
    loadOrCreateOnboarding(profileId, {
      full_name: profile?.full_name,
      email: profile?.email ?? session?.user.email,
    }).then(({ data, error: e }) => {
      if (e || !data) {
        setError(e ?? 'Could not start onboarding.');
        return;
      }
      setRecord(data);
      setStep(data.current_step && data.current_step <= TOTAL_STEPS ? data.current_step : 1);
      setFullName(data.full_name ?? profile?.full_name ?? '');
      setPhone(data.phone ?? '');
      setBusinessType(data.business_type);
      setCompanyName(data.company_name ?? '');
      const a: OnboardingAnswers = data.answers ?? {};
      setAreasServed(a.areas_served ?? '');
      setPropertyTypes(a.property_types ?? []);
      setGoal(a.primary_goal ?? null);
      setLeadSources(a.lead_sources ?? []);
    });
  }, [profileId]);

  const answers: OnboardingAnswers = useMemo(
    () => ({
      areas_served: areasServed.trim() || undefined,
      property_types: propertyTypes,
      primary_goal: goal ?? undefined,
      lead_sources: leadSources,
    }),
    [areasServed, propertyTypes, goal, leadSources],
  );

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const stepValid = (): string | null => {
    if (step === 1 && !fullName.trim()) return 'Please enter your name.';
    if (step === 2 && !businessType) return 'Please pick what best describes you.';
    if (step === 2 && businessType !== 'agent' && !companyName.trim())
      return 'Please enter your company name.';
    if (step === 3 && propertyTypes.length === 0) return 'Pick at least one property type.';
    if (step === 4 && !goal) return 'Pick your main goal.';
    return null;
  };

  const persist = async (nextStep: number) => {
    if (!record) return;
    await saveOnboardingStep(record.id, {
      current_step: nextStep,
      full_name: fullName.trim() || null,
      phone: phone.trim() || null,
      business_type: businessType,
      company_name: businessType === 'agent' ? null : companyName.trim() || null,
      answers,
    });
  };

  const onNext = async () => {
    const v = stepValid();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSaving(true);
    if (step < TOTAL_STEPS) {
      await persist(step + 1);
      setSaving(false);
      setStep(step + 1);
    } else {
      const { error: e } = await submitOnboarding(record!.id, {
        current_step: TOTAL_STEPS,
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        business_type: businessType,
        company_name: businessType === 'agent' ? null : companyName.trim() || null,
        answers,
      });
      setSaving(false);
      if (e) {
        setError(e);
        return;
      }
      await refreshOnboarding();
      router.replace('/');
    }
  };

  const onBack = () => {
    setError(null);
    if (step > 1) setStep(step - 1);
  };

  if (!record && !error) {
    return (
      <SafeAreaView style={styles.safeCentered}>
        <ActivityIndicator color={BrandColors.navy} />
        <Text style={styles.loadingText}>Setting things up…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.progressTrack}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[styles.progressDot, i < step ? styles.progressDotActive : null]}
            />
          ))}
        </View>
        <Text style={styles.stepLabel}>
          Step {step} of {TOTAL_STEPS}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 1 && (
          <>
            <View style={styles.heroRow}>
              <Image source={baymoAvatar} style={styles.baymo} contentFit="contain" />
              <View style={styles.flex}>
                <Text style={styles.title}>Kumusta! I'm BayMo 🐱</Text>
                <Text style={styles.subtitle}>
                  Let's set up your account. Ilang tanong lang — 2 minutes.
                </Text>
              </View>
            </View>
            <TextField
              label="Your full name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Juan Dela Cruz"
              autoCapitalize="words"
            />
            <TextField
              label="Mobile number (optional)"
              value={phone}
              onChangeText={setPhone}
              placeholder="0917 123 4567"
              keyboardType="phone-pad"
            />
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>What best describes you?</Text>
            <View style={styles.choiceList}>
              {BUSINESS_TYPES.map((b) => (
                <Pressable
                  key={b.value}
                  onPress={() => setBusinessType(b.value)}
                  style={[styles.choiceCard, businessType === b.value ? styles.choiceCardActive : null]}>
                  <View style={styles.flex}>
                    <Text style={styles.choiceTitle}>{b.label}</Text>
                    <Text style={styles.choiceSub}>{b.sub}</Text>
                  </View>
                  <View style={[styles.radio, businessType === b.value ? styles.radioOn : null]} />
                </Pressable>
              ))}
            </View>
            {businessType && businessType !== 'agent' && (
              <TextField
                label="Company / brokerage name"
                value={companyName}
                onChangeText={setCompanyName}
                placeholder="e.g. Prime Batangas Realty"
                autoCapitalize="words"
              />
            )}
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.title}>What do you sell?</Text>
            <Text style={styles.subtitle}>Select all that apply.</Text>
            <View style={styles.chips}>
              {PROPERTY_TYPES.map((t) => (
                <TagPill
                  key={t}
                  label={t}
                  active={propertyTypes.includes(t)}
                  onPress={() => toggle(propertyTypes, setPropertyTypes, t)}
                />
              ))}
            </View>
            <TextField
              label="Areas you serve"
              value={areasServed}
              onChangeText={setAreasServed}
              placeholder="e.g. Lipa, Batangas · CALABARZON"
            />
          </>
        )}

        {step === 4 && (
          <>
            <Text style={styles.title}>What's your main goal with BaMo?</Text>
            <View style={styles.choiceList}>
              {GOALS.map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setGoal(g)}
                  style={[styles.choiceCard, goal === g ? styles.choiceCardActive : null]}>
                  <Text style={styles.choiceTitle}>{g}</Text>
                  <View style={[styles.radio, goal === g ? styles.radioOn : null]} />
                </Pressable>
              ))}
            </View>
            <Text style={[styles.subtitle, { marginTop: 8 }]}>
              Where do your leads come from today?
            </Text>
            <View style={styles.chips}>
              {LEAD_SOURCES.map((s) => (
                <TagPill
                  key={s}
                  label={s}
                  active={leadSources.includes(s)}
                  onPress={() => toggle(leadSources, setLeadSources, s)}
                />
              ))}
            </View>
          </>
        )}

        {step === 5 && (
          <>
            <Text style={styles.title}>Quick review 👀</Text>
            <Text style={styles.subtitle}>Tama ba lahat? You can go back to edit.</Text>
            <View style={styles.reviewCard}>
              <ReviewRow label="Name" value={fullName} />
              <ReviewRow label="Mobile" value={phone || '—'} />
              <ReviewRow
                label="Type"
                value={BUSINESS_TYPES.find((b) => b.value === businessType)?.label ?? '—'}
              />
              {businessType !== 'agent' && <ReviewRow label="Company" value={companyName || '—'} />}
              <ReviewRow label="Sells" value={propertyTypes.join(', ') || '—'} />
              <ReviewRow label="Areas" value={areasServed || '—'} />
              <ReviewRow label="Goal" value={goal ?? '—'} />
              <ReviewRow label="Lead sources" value={leadSources.join(', ') || '—'} />
            </View>
          </>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        {step > 1 ? (
          <Button label="Back" variant="secondary" onPress={onBack} style={styles.footerBtn} />
        ) : (
          <View style={styles.footerBtn} />
        )}
        <Button
          label={saving ? 'Saving…' : step === TOTAL_STEPS ? 'Finish setup' : 'Continue'}
          onPress={onNext}
          style={styles.footerBtn}
        />
      </View>
    </SafeAreaView>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BrandColors.screenBg },
  safeCentered: {
    flex: 1,
    backgroundColor: BrandColors.screenBg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { ...TypeScale.body, color: BrandColors.textBody },
  flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, gap: 6 },
  progressTrack: { flexDirection: 'row', gap: 6 },
  progressDot: {
    flex: 1,
    height: 6,
    borderRadius: Radii.pill,
    backgroundColor: BrandColors.border,
  },
  progressDotActive: { backgroundColor: BrandColors.orange },
  stepLabel: { ...TypeScale.labelSmall, color: BrandColors.textMuted },
  content: { padding: 20, gap: 16 },
  heroRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  baymo: { width: 64, height: 64 },
  title: { ...TypeScale.h2, color: BrandColors.textHeading },
  subtitle: { ...TypeScale.body, color: BrandColors.textBody },
  choiceList: { gap: 10 },
  choiceCard: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    borderWidth: 1.5,
    borderColor: BrandColors.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  choiceCardActive: { borderColor: BrandColors.orange, backgroundColor: BrandColors.cream100 },
  choiceTitle: { ...TypeScale.h4, color: BrandColors.textHeading },
  choiceSub: { ...TypeScale.bodySmall, color: BrandColors.textMuted },
  radio: {
    width: 22,
    height: 22,
    borderRadius: Radii.pill,
    borderWidth: 2,
    borderColor: BrandColors.borderDark,
  },
  radioOn: {
    borderColor: BrandColors.orange,
    backgroundColor: BrandColors.orange,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reviewCard: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 16,
    gap: 10,
  },
  reviewRow: { flexDirection: 'row', gap: 12 },
  reviewLabel: { ...TypeScale.label, color: BrandColors.textMuted, width: 96 },
  reviewValue: { ...TypeScale.body, color: BrandColors.textHeading, flex: 1 },
  errorText: { ...TypeScale.formError, color: BrandColors.error },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
    backgroundColor: BrandColors.white,
  },
  footerBtn: { flex: 1 },
});
