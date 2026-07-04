import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
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
import { submitCampaignRequest } from '@/lib/ads';
import { fetchListingOptions } from '@/lib/website';

const GOALS = [
  { value: 'more_leads', label: 'More leads' },
  { value: 'listing_promotion', label: 'Promote a listing' },
  { value: 'brand_awareness', label: 'Brand awareness' },
  { value: 'open_house', label: 'Open house turnout' },
];

const BUDGET_RANGES = [
  { value: 'under_5k', label: 'Under ₱5,000' },
  { value: '5k_15k', label: '₱5,000 – ₱15,000' },
  { value: '15k_30k', label: '₱15,000 – ₱30,000' },
  { value: 'over_30k', label: 'Over ₱30,000' },
];

const DURATIONS = [7, 14, 30];

export default function CampaignRequestScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const clientId = profile?.client_id ?? null;
  const userId = session?.user.id ?? null;

  const [goal, setGoal] = useState('more_leads');
  const [budgetRange, setBudgetRange] = useState('5k_15k');
  const [duration, setDuration] = useState(14);
  const [listings, setListings] = useState<{ id: string; title: string }[]>([]);
  const [listingId, setListingId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchListingOptions().then(setListings);
  }, []);

  const submit = async () => {
    if (!clientId || !userId) {
      Alert.alert('Not ready', 'Your workspace is still being set up. Please try again shortly.');
      return;
    }
    setSaving(true);
    const { error } = await submitCampaignRequest(clientId, userId, {
      goal,
      budget_range: budgetRange,
      duration_days: duration,
      listing_id: listingId,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not send', error);
      return;
    }
    Alert.alert(
      'Request sent 🎉',
      'The BaMo team will review and set up your campaign — you’ll see it here once it’s live.',
      [{ text: 'Done', onPress: () => router.back() }],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={BrandColors.textHeading} />
        </Pressable>
        <Text style={styles.headerTitle}>Request a Campaign</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>Goal</Text>
        <View style={styles.pillRow}>
          {GOALS.map((g) => (
            <TagPill key={g.value} label={g.label} active={goal === g.value} onPress={() => setGoal(g.value)} />
          ))}
        </View>

        <Text style={styles.section}>Budget range</Text>
        <View style={styles.pillRow}>
          {BUDGET_RANGES.map((b) => (
            <TagPill key={b.value} label={b.label} active={budgetRange === b.value} onPress={() => setBudgetRange(b.value)} />
          ))}
        </View>

        <Text style={styles.section}>Duration</Text>
        <View style={styles.pillRow}>
          {DURATIONS.map((d) => (
            <TagPill key={d} label={`${d} days`} active={duration === d} onPress={() => setDuration(d)} />
          ))}
        </View>

        <Text style={styles.section}>Link a listing (optional)</Text>
        {listings.length === 0 ? (
          <Text style={styles.muted}>No listings yet — post one in the Listings tab, or describe it in the notes.</Text>
        ) : (
          <View style={styles.pillRow}>
            {listings.map((l) => (
              <TagPill
                key={l.id}
                label={l.title || 'Untitled'}
                active={listingId === l.id}
                onPress={() => setListingId(listingId === l.id ? null : l.id)}
              />
            ))}
          </View>
        )}

        <Text style={styles.section}>Notes</Text>
        <TextField
          label="Anything BaMo should know (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. target OFW buyers, boost the open house this Saturday"
          multiline
          numberOfLines={3}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button label={saving ? 'Sending…' : 'Submit request'} onPress={submit} style={{ width: '100%' }} />
      </View>
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
  section: { ...TypeScale.h4, color: BrandColors.textHeading, marginTop: 8 },
  muted: { ...TypeScale.body, color: BrandColors.textMuted },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
    backgroundColor: BrandColors.white,
  },
});
