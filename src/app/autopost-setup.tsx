import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TagPill } from '@/components/ui/tag-pill';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, TypeScale } from '@/constants/brand';
import {
  AutopostTopic,
  TOPIC_OPTIONS,
  WeeklyTopic,
  activateAutopost,
  fetchAdsPlan,
  isPaidPlan,
  submitSubscriptionRequest,
} from '@/lib/social';
import { fetchListingOptions } from '@/lib/website';

type WeekState = {
  topic: AutopostTopic | null;
  listingId: string | null;
  notes: string;
  date: string;
  time: string;
  venue: string;
};

const emptyWeek = (): WeekState => ({
  topic: null,
  listingId: null,
  notes: '',
  date: '',
  time: '',
  venue: '',
});

const NOTES_PLACEHOLDER: Record<AutopostTopic, string> = {
  listing: 'Anything to highlight about this listing (optional)',
  house_tour: 'What should the tour focus on? (optional)',
  open_house: 'Extra details — freebies, RSVP instructions (optional)',
  agent_info: 'Your highlights — years in RE, awards, specialization',
  property_info: 'Describe the property or development to feature',
  viewing_invitation: 'Extra details for the invitation (optional)',
  re_info: 'e.g. Pag-IBIG loan process, Capital Gains Tax — leave blank and BaMo picks',
  others: 'Tell BaMo what to post about',
};

export default function AutopostSetupScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const clientId = profile?.client_id ?? null;
  const userId = session?.user.id ?? null;

  const [checking, setChecking] = useState(true);
  const [paid, setPaid] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);

  const [listings, setListings] = useState<{ id: string; title: string }[]>([]);
  const [step, setStep] = useState(0); // 0..3 = week 1..4
  const [weeks, setWeeks] = useState<WeekState[]>([emptyWeek(), emptyWeek(), emptyWeek(), emptyWeek()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAdsPlan().then((info) => {
      setPaid(isPaidPlan(info));
      setChecking(false);
    });
    fetchListingOptions().then(setListings);
  }, []);

  const week = weeks[step];
  const setWeek = (patch: Partial<WeekState>) => {
    setWeeks((ws) => ws.map((w, i) => (i === step ? { ...w, ...patch } : w)));
  };

  const needsListing = week.topic === 'listing' || week.topic === 'house_tour';
  const needsEvent = week.topic === 'open_house' || week.topic === 'viewing_invitation';

  const weekValid = (w: WeekState) => {
    if (!w.topic) return false;
    if (w.topic === 'others' && !w.notes.trim()) return false;
    return true;
  };

  const next = () => {
    if (!weekValid(week)) {
      Alert.alert(
        'Almost there',
        week.topic ? 'Please tell BaMo what to post about for this week.' : 'Pick a topic for this week.',
      );
      return;
    }
    if (step < 3) setStep(step + 1);
    else activate();
  };

  const activate = async () => {
    if (!clientId || !userId) {
      Alert.alert('Not ready', 'Your workspace is still being set up. Please try again shortly.');
      return;
    }
    setSaving(true);
    const weeklyTopics: WeeklyTopic[] = weeks.map((w, i) => ({
      week: (i + 1) as WeeklyTopic['week'],
      topic: w.topic as AutopostTopic,
      details: {
        listing_id: w.listingId,
        notes: w.notes.trim() || null,
        date: w.date.trim() || null,
        time: w.time.trim() || null,
        venue: w.venue.trim() || null,
      },
    }));
    const { error } = await activateAutopost(clientId, userId, weeklyTopics);
    setSaving(false);
    if (error) {
      Alert.alert('Could not activate', error);
      return;
    }
    Alert.alert(
      'Auto-posting activated 🎉',
      'BaMo will prepare 3 posts a week for the next month. Each post comes to you for approval before it goes out.',
      [{ text: 'Done', onPress: () => router.back() }],
    );
  };

  const requestSubscription = async () => {
    if (!clientId || !userId) return;
    setRequesting(true);
    const { error } = await submitSubscriptionRequest(clientId, userId, 'social_autopost');
    setRequesting(false);
    if (error) Alert.alert('Could not send', error);
    else setRequested(true);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={BrandColors.textHeading} />
        </Pressable>
        <Text style={styles.headerTitle}>BaMo Auto-Posting</Text>
        <View style={{ width: 26 }} />
      </View>

      {checking ? (
        <ActivityIndicator color={BrandColors.navy} style={{ marginTop: 40 }} />
      ) : !paid ? (
        /* Paid-plan gate */
        <View style={styles.gate}>
          <View style={styles.gateIcon}>
            <Ionicons name="lock-closed-outline" size={30} color={BrandColors.orange} />
          </View>
          <Text style={styles.gateTitle}>You’re not on a paid plan yet</Text>
          <Text style={styles.gateBody}>
            Auto-posting is included in BaMo paid plans — BaMo prepares 3 Facebook posts a week for
            you (1 static + 2 short videos), on the topics you choose. Subscribe to activate.
          </Text>
          {requested ? (
            <Text style={styles.gateSent}>
              Request sent ✔ The BaMo team will contact you to set up your subscription.
            </Text>
          ) : (
            <Button
              label={requesting ? 'Sending…' : 'Subscribe to activate'}
              onPress={requestSubscription}
              style={{ alignSelf: 'stretch' }}
            />
          )}
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {/* Progress */}
            <View style={styles.progressRow}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[styles.progressSeg, i <= step && { backgroundColor: BrandColors.orange }]}
                />
              ))}
            </View>
            <Text style={styles.stepTitle}>Week {step + 1} topic</Text>
            <Text style={styles.hint}>
              What should BaMo post about in week {step + 1}? 3 posts will be made on this topic.
            </Text>

            <View style={styles.pillRow}>
              {TOPIC_OPTIONS.map((t) => (
                <TagPill
                  key={t.value}
                  label={t.label}
                  active={week.topic === t.value}
                  onPress={() => setWeek({ topic: t.value })}
                />
              ))}
            </View>

            {/* Conditional details */}
            {needsListing && (
              <>
                <Text style={styles.section}>Which listing?</Text>
                {listings.length === 0 ? (
                  <Text style={styles.muted}>
                    No listings yet — post one in the Listings tab, or describe the property below.
                  </Text>
                ) : (
                  <View style={styles.pillRow}>
                    {listings.map((l) => (
                      <TagPill
                        key={l.id}
                        label={l.title || 'Untitled'}
                        active={week.listingId === l.id}
                        onPress={() => setWeek({ listingId: week.listingId === l.id ? null : l.id })}
                      />
                    ))}
                  </View>
                )}
              </>
            )}

            {needsEvent && (
              <>
                <Text style={styles.section}>Event details</Text>
                <TextField label="Date" value={week.date} onChangeText={(v) => setWeek({ date: v })} placeholder="YYYY-MM-DD" autoCapitalize="none" />
                <TextField label="Time" value={week.time} onChangeText={(v) => setWeek({ time: v })} placeholder="e.g. 10:00 AM - 4:00 PM" />
                <TextField label="Venue" value={week.venue} onChangeText={(v) => setWeek({ venue: v })} placeholder="e.g. Vermira Living Spaces, Lipa" />
              </>
            )}

            {week.topic && (
              <TextField
                label={week.topic === 'others' ? 'What should BaMo post?' : 'Details for BaMo'}
                value={week.notes}
                onChangeText={(v) => setWeek({ notes: v })}
                placeholder={NOTES_PLACEHOLDER[week.topic]}
                multiline
                numberOfLines={3}
              />
            )}
          </ScrollView>

          <View style={styles.footer}>
            {step > 0 && (
              <Button label="Back" variant="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} />
            )}
            <Button
              label={saving ? 'Activating…' : step < 3 ? 'Next' : 'Activate'}
              onPress={next}
              style={{ flex: 2 }}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BrandColors.screenBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: BrandColors.white,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.border,
  },
  headerTitle: { ...TypeScale.h4, color: BrandColors.textHeading },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  progressSeg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: BrandColors.borderLight,
  },
  stepTitle: { ...TypeScale.h3, color: BrandColors.textHeading },
  hint: { ...TypeScale.bodySmall, color: BrandColors.textBody },
  section: { ...TypeScale.h4, color: BrandColors.textHeading, marginTop: 8 },
  muted: { ...TypeScale.body, color: BrandColors.textMuted },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
    backgroundColor: BrandColors.white,
  },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 12,
  },
  gateIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: BrandColors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateTitle: { ...TypeScale.h3, color: BrandColors.textHeading, textAlign: 'center' },
  gateBody: { ...TypeScale.body, color: BrandColors.textBody, textAlign: 'center' },
  gateSent: { ...TypeScale.bodyBold, color: BrandColors.success, textAlign: 'center' },
});
