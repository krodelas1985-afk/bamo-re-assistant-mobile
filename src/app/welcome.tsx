import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TagPill } from '@/components/ui/tag-pill';
import { TextField } from '@/components/ui/text-field';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import { useAuth } from '@/contexts/auth-context';
import {
  completeWelcomeTour,
  startWelcomeTour,
  TourSteps,
} from '@/lib/welcome-tour';

const baymoAvatar = require('../../assets/brand/baymo.png');

const TOTAL_STEPS = 7;

/** Step 2 capability cards — the 3P story, never the backend app names. */
const CAPABILITIES: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }[] = [
  {
    icon: 'chatbubbles-outline',
    title: 'Sagot agad, 24/7',
    sub: 'I answer property inquiries the moment they arrive — kahit madaling-araw.',
  },
  {
    icon: 'flame-outline',
    title: 'Warm & hot leads, delivered',
    sub: 'I follow up and qualify every lead, then hand you the ones ready to talk.',
  },
  {
    icon: 'calendar-outline',
    title: 'Appointments booked for you',
    sub: 'Calls and viewings land straight in your calendar.',
  },
  {
    icon: 'megaphone-outline',
    title: 'Posts & creatives',
    sub: 'Social media content and listing ads, made for you.',
  },
  {
    icon: 'globe-outline',
    title: 'Your own agent website',
    sub: 'A professional page that brings in leads while you sleep.',
  },
];

/** Step 4 — the full BaMo service menu (matches the plan of record). */
const SERVICES = [
  'Lead generation ads',
  'Auto-reply & follow-up',
  'Social media content',
  'Listing creatives & videos',
  'Agent website',
  'Marketplace listings',
  'Appointment setting',
  'Documents (ATS, MOA, CTS)',
];

/** Step 6 quick chips. */
const HELP_CHIPS = ['Get me more leads', 'Set up my FB page', 'Make me a post', 'Just exploring'];

export default function WelcomeTourScreen() {
  const router = useRouter();
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  const isReplay = replay === '1';
  const { session, profile, refreshWelcomeTour } = useAuth();
  const profileId = session?.user.id ?? null;

  const [step, setStep] = useState(1);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Answers
  const [services, setServices] = useState<string[]>([]);
  const [helpText, setHelpText] = useState('');
  const [helpChip, setHelpChip] = useState<string | null>(null);
  const [listingIntent, setListingIntent] = useState(false);

  // Per-step outcome, written once on finish.
  const stepsRef = useRef<TourSteps>({});
  const markStep = (n: number, status: 'done' | 'skipped') => {
    stepsRef.current[String(n)] = { status, at: new Date().toISOString() };
  };

  useEffect(() => {
    if (profileId && !isReplay) startWelcomeTour(profileId);
  }, [profileId, isReplay]);

  const firstName = profile?.full_name?.split(/\s+/)[0] ?? null;

  const advance = (status: 'done' | 'skipped') => {
    setError(null);
    markStep(step, status);
    if (step < TOTAL_STEPS) setStep(step + 1);
    else void finish(false);
  };

  const finish = async (skippedAll: boolean) => {
    if (finishing) return;
    setFinishing(true);
    // A bare "Just exploring" isn't a request — nothing useful to hand to chat.
    const chatSeed =
      [helpChip === 'Just exploring' ? null : helpChip, helpText.trim()]
        .filter(Boolean)
        .join(' — ') || null;
    // Replay mode is read-only: the row (and its notification) already exists.
    if (profileId && !isReplay) {
      const helpRequest = [helpChip, helpText.trim()].filter(Boolean).join(' — ') || null;
      const { error: e } = await completeWelcomeTour(profileId, {
        skipped: skippedAll,
        steps: stepsRef.current,
        services_needed: services,
        help_request: helpRequest,
        listing_intent: listingIntent,
      });
      if (e) {
        setFinishing(false);
        setError(e);
        return;
      }
      await refreshWelcomeTour();
    }
    setFinishing(false);
    router.replace('/');
    // Their step-6 answer becomes their first BayMo chat message (decided
    // 2026-07-18) — skipped-all tours and replays go straight to the dashboard.
    if (!skippedAll && !isReplay && chatSeed) {
      router.push({ pathname: '/chat', params: { seed: chatSeed } });
    }
  };

  const toggleService = (s: string) =>
    setServices((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]));

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header: progress dots + skip */}
      <View style={styles.header}>
        <View style={styles.progressTrack}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View key={i} style={[styles.progressDot, i < step ? styles.progressDotActive : null]} />
          ))}
        </View>
        {step > 1 && step < TOTAL_STEPS ? (
          <Pressable onPress={() => advance('skipped')} hitSlop={12}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        ) : (
          <View style={styles.skipSpacer} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 1 && (
          <View style={styles.heroWrap}>
            <FloatingBaymo />
            <Text style={styles.heroTitle}>
              {firstName ? `Kumusta, ${firstName}! 👋` : 'Kumusta! 👋'}
            </Text>
            <Text style={styles.heroName}>I&apos;m BayMo</Text>
            <Text style={styles.heroSub}>
              Your AI Virtual Assistant. Ako na ang bahala sa inquiries at follow-ups — ikaw, focus
              ka lang sa closing deals. 🏡
            </Text>
          </View>
        )}

        {step === 2 && (
          <>
            <StepHeading
              title="Here's what I can do"
              sub="Habang tulog ka, I'm working. All of this runs in the background."
            />
            <View style={styles.cardList}>
              {CAPABILITIES.map((c) => (
                <View key={c.title} style={styles.capCard}>
                  <View style={styles.capIcon}>
                    <Ionicons name={c.icon} size={22} color={BrandColors.navy} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.capTitle}>{c.title}</Text>
                    <Text style={styles.capSub}>{c.sub}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <StepHeading
              title="Getting to know you"
              sub="Your profile powers your documents, posts, and website — one-time setup lang."
            />
            <View style={styles.actionCard}>
              {profileFilled(profile) ? (
                <View style={styles.profileDoneRow}>
                  {profile?.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={styles.profileDoneAvatar} />
                  ) : (
                    <Ionicons name="checkmark-circle" size={28} color={BrandColors.success} />
                  )}
                  <Text style={styles.profileDoneText}>
                    Ayos, {profile?.full_name?.split(/\s+/)[0] ?? 'agent'}! Your profile is looking
                    good. ✓
                  </Text>
                </View>
              ) : (
                <Text style={styles.actionCardText}>
                  Add your photo, PRC license, company, and the areas you serve.
                </Text>
              )}
              <Button
                label={profileFilled(profile) ? 'Review my profile' : 'Edit my profile'}
                onPress={() => router.push('/profile')}
              />
              {!profileFilled(profile) && (
                <Text style={styles.helperText}>Balik ka lang dito pagkatapos — I&apos;ll wait. 🐱</Text>
              )}
            </View>
          </>
        )}

        {step === 4 && (
          <>
            <StepHeading
              title="What do you need help with?"
              sub="Pick everything that interests you — this helps the BaMo team set you up."
            />
            <View style={styles.chips}>
              {SERVICES.map((s) => (
                <TagPill
                  key={s}
                  label={s}
                  active={services.includes(s)}
                  onPress={() => toggleService(s)}
                />
              ))}
            </View>
          </>
        )}

        {step === 5 && (
          <>
            <StepHeading
              title="Post your listings — free"
              sub="Your properties on BaMo Marketplace, discoverable by buyers nationwide. Libre."
            />
            <View style={styles.actionCard}>
              <Text style={styles.actionCardText}>
                Add your first listing now. After you submit, the BaMo admin verifies it before it
                goes live.
              </Text>
              <Button
                label="Add my first listing"
                onPress={() => {
                  setListingIntent(true);
                  router.push('/listing-new');
                }}
              />
              <Button label="Maybe later" variant="secondary" onPress={() => advance('done')} />
            </View>
          </>
        )}

        {step === 6 && (
          <>
            <StepHeading
              title="Anong maitutulong ko today?"
              sub="Tell me what you need — the BaMo team and I will get on it."
            />
            <View style={styles.chips}>
              {HELP_CHIPS.map((c) => (
                <TagPill
                  key={c}
                  label={c}
                  active={helpChip === c}
                  onPress={() => setHelpChip((cur) => (cur === c ? null : c))}
                />
              ))}
            </View>
            <TextField
              label="Anything else? (optional)"
              value={helpText}
              onChangeText={setHelpText}
              placeholder="e.g. I want more inquiries for my Lipa listings"
              multiline
              numberOfLines={3}
            />
          </>
        )}

        {step === 7 && (
          <View style={styles.heroWrap}>
            <FloatingBaymo />
            <Text style={styles.heroTitle}>Tara na! 🎉</Text>
            <Text style={styles.heroSub}>
              {services.length > 0
                ? `Sulit 'to, promise! I noted what you need (${services.length} ${
                    services.length === 1 ? 'service' : 'services'
                  }) — the BaMo team will reach out to set you up.`
                : 'All set! Balik ka lang sa Settings kung gusto mong ulitin itong intro.'}
            </Text>
          </View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      {/* BayMo corner avatar on the task steps (hero steps show him large). */}
      {step >= 2 && step <= 6 && (
        <Image source={baymoAvatar} style={styles.baymoCorner} contentFit="contain" />
      )}

      <View style={styles.footer}>
        {step === 1 ? (
          <>
            <Button
              label="Skip tour"
              variant="secondary"
              onPress={() => finish(true)}
              style={styles.footerBtn}
            />
            <Button label="Tara, let's go!" onPress={() => advance('done')} style={styles.footerBtn} />
          </>
        ) : (
          <>
            <Button
              label="Back"
              variant="secondary"
              onPress={() => setStep((s) => Math.max(1, s - 1))}
              style={styles.footerBtn}
            />
            <Button
              label={
                step === TOTAL_STEPS
                  ? finishing
                    ? 'Opening…'
                    : 'Go to my dashboard'
                  : 'Continue'
              }
              onPress={() => advance('done')}
              style={styles.footerBtn}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

/** "Set up enough": beyond the basics the CRM seeds (name/email), any of the fields the tour asks for. */
function profileFilled(profile: { avatar_url?: string | null; prc_number?: string | null; company?: string | null; service_area?: string | null; location_city?: string | null } | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.avatar_url ||
      profile.prc_number ||
      profile.company ||
      profile.service_area ||
      profile.location_city,
  );
}

function StepHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={styles.stepHeading}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{sub}</Text>
    </View>
  );
}

/** Hero BayMo: springs in on mount, then floats gently. */
function FloatingBaymo() {
  const scale = useSharedValue(0.85);
  const floatY = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 120 });
    floatY.value = withRepeat(
      withSequence(
        withTiming(-7, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [scale, floatY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: floatY.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Image source={baymoAvatar} style={styles.baymoHero} contentFit="contain" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BrandColors.cream50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  progressTrack: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: BrandColors.cream400,
  },
  progressDotActive: {
    backgroundColor: BrandColors.orange,
  },
  skipText: {
    ...TypeScale.bodyBold,
    color: BrandColors.textMuted,
  },
  skipSpacer: {
    width: 30,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 14,
  },
  flex: { flex: 1 },
  heroWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 24,
  },
  baymoHero: {
    width: 180,
    height: 180,
    marginBottom: 10,
  },
  heroTitle: {
    ...TypeScale.h2,
    color: BrandColors.textHeading,
    textAlign: 'center',
  },
  heroName: {
    ...TypeScale.displayXS,
    color: BrandColors.navy,
    textAlign: 'center',
  },
  heroSub: {
    ...TypeScale.bodyLarge,
    color: BrandColors.textBody,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 320,
  },
  stepHeading: {
    gap: 4,
    marginTop: 8,
    paddingRight: 56, // keep clear of the corner BayMo
  },
  title: {
    ...TypeScale.h2,
    color: BrandColors.textHeading,
  },
  subtitle: {
    ...TypeScale.body,
    color: BrandColors.textBody,
  },
  cardList: {
    gap: 10,
  },
  capCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 14,
  },
  capIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: BrandColors.cream200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capTitle: {
    ...TypeScale.bodyBold,
    color: BrandColors.textHeading,
  },
  capSub: {
    ...TypeScale.bodySmall,
    color: BrandColors.textBody,
    marginTop: 2,
  },
  actionCard: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 16,
    gap: 12,
  },
  actionCardText: {
    ...TypeScale.body,
    color: BrandColors.textBody,
  },
  profileDoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  profileDoneAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BrandColors.cream100,
  },
  profileDoneText: {
    ...TypeScale.bodyBold,
    color: BrandColors.textHeading,
    flex: 1,
  },
  helperText: {
    ...TypeScale.helper,
    color: BrandColors.textMuted,
    textAlign: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  baymoCorner: {
    position: 'absolute',
    top: 40,
    right: 12,
    width: 52,
    height: 52,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: BrandColors.borderLight,
    backgroundColor: BrandColors.white,
  },
  footerBtn: {
    flex: 1,
  },
  errorText: {
    ...TypeScale.formError,
    color: BrandColors.error,
  },
});
