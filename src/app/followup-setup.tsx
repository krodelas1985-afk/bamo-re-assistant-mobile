import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandColors, CardShadow, Radii, TypeScale } from '@/constants/brand';
import { useAuth } from '@/contexts/auth-context';
import {
  FollowupCampaign,
  disableFollowup,
  fetchFollowupCampaigns,
  requestFollowupEnable,
} from '@/lib/automations';

/**
 * Auto Follow-Up, per campaign.
 *
 * Switching ON files a request: the BaMo team sets the touch schedule, goal and
 * sending hours before anything goes out, so the row reads "Being set up" until
 * it is actually live. Switching OFF applies immediately — a client wanting
 * automated messages stopped under their own name should not wait for a review.
 */
export default function FollowupSetupScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const clientId = profile?.client_id ?? null;
  const userId = session?.user.id ?? null;

  const [campaigns, setCampaigns] = useState<FollowupCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // useFocusEffect rather than useEffect: coming back to this screen after the
  // BaMo team switches a campaign on should show the new state, not a stale one.
  useFocusEffect(
    useCallback(() => {
      fetchFollowupCampaigns().then((rows) => {
        setCampaigns(rows);
        setLoading(false);
      });
    }, []),
  );

  const onToggle = async (c: FollowupCampaign, next: boolean) => {
    if (!clientId || !userId) {
      Alert.alert('Not ready', 'Your workspace is still being set up. Please try again shortly.');
      return;
    }
    setBusyId(c.campaignId);

    if (next) {
      const { error } = await requestFollowupEnable(clientId, userId, c.campaignId);
      setBusyId(null);
      if (error) {
        Alert.alert('Could not send request', error);
        return;
      }
      // It is a request, not a switch — show "being set up" rather than "on".
      setCampaigns((prev) =>
        prev.map((x) => (x.campaignId === c.campaignId ? { ...x, state: 'pending' } : x)),
      );
      Alert.alert(
        'Request sent',
        'The BaMo team will set up the follow-up schedule for this campaign and switch it on. You’ll see it here once it’s live.',
      );
      return;
    }

    const { error } = await disableFollowup(c.campaignId);
    setBusyId(null);
    if (error) {
      Alert.alert('Could not switch off', error);
      return;
    }
    setCampaigns((prev) =>
      prev.map((x) => (x.campaignId === c.campaignId ? { ...x, state: 'off' } : x)),
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={BrandColors.textHeading} />
        </Pressable>
        <Text style={styles.headerTitle}>Auto Follow-Up</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.lede}>
          When a lead goes quiet, BayMo follows up for you — and steps back the moment they reply.
          Choose which campaigns it should work on.
        </Text>

        {loading && <ActivityIndicator color={BrandColors.navy} style={{ marginVertical: 24 }} />}

        {!loading && campaigns.length === 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>No active campaigns yet</Text>
            <Text style={styles.cardBody}>
              Once a campaign is running, you can switch follow-up on for it here.
            </Text>
          </View>
        )}

        {!loading &&
          campaigns.map((c) => (
            <View key={c.campaignId} style={styles.card}>
              <View style={styles.cardRow}>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{c.name}</Text>
                  <Text
                    style={[
                      styles.statusLine,
                      c.state === 'on' && { color: BrandColors.successDeep },
                      c.state === 'pending' && { color: BrandColors.orangeDark },
                    ]}
                  >
                    {c.state === 'on'
                      ? 'On — following up with quiet leads'
                      : c.state === 'pending'
                        ? 'Being set up by the BaMo team'
                        : 'Off'}
                  </Text>
                  {!!c.adminNotes && c.state === 'off' && (
                    <Text style={styles.noteLine}>{c.adminNotes}</Text>
                  )}
                </View>

                {busyId === c.campaignId ? (
                  <ActivityIndicator color={BrandColors.navy} />
                ) : (
                  <Switch
                    value={c.state !== 'off'}
                    onValueChange={(v) => onToggle(c, v)}
                    disabled={c.state === 'pending'}
                    trackColor={{ true: BrandColors.navy, false: BrandColors.border }}
                  />
                )}
              </View>
            </View>
          ))}

        {!loading && campaigns.length > 0 && (
          <Text style={styles.footnote}>
            Switching off takes effect right away. Switching on needs a quick set-up by the BaMo
            team so the timing and message style suit your campaign.
          </Text>
        )}
      </ScrollView>
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
  lede: { ...TypeScale.body, color: BrandColors.textSecondary, marginBottom: 4 },
  card: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: BrandColors.border,
    padding: 16,
    ...CardShadow,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardText: { flex: 1, paddingRight: 12 },
  cardTitle: { ...TypeScale.bodyBold, color: BrandColors.textHeading },
  cardBody: { ...TypeScale.bodySmall, color: BrandColors.textSecondary, marginTop: 4 },
  statusLine: { ...TypeScale.bodySmall, color: BrandColors.textMuted, marginTop: 4 },
  noteLine: {
    ...TypeScale.bodySmall,
    color: BrandColors.textMuted,
    marginTop: 6,
    fontStyle: 'italic',
  },
  footnote: { ...TypeScale.bodySmall, color: BrandColors.textMuted, marginTop: 8 },
});
