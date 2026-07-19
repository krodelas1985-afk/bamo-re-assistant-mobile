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
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import { useAuth } from '@/contexts/auth-context';
import {
  FOLLOWUP_DURATIONS,
  FOLLOWUP_STYLES,
  FollowupRequest,
  FollowupStyle,
  fetchLatestFollowupRequest,
  submitFollowupRequest,
} from '@/lib/automations';

export default function FollowupSetupScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const clientId = profile?.client_id ?? null;
  const userId = session?.user.id ?? null;

  const [existing, setExisting] = useState<FollowupRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [style, setStyle] = useState<FollowupStyle>('standard');
  const [duration, setDuration] = useState<number>(14);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLatestFollowupRequest().then((r) => {
      setExisting(r);
      setLoading(false);
    });
  }, []);

  const submit = async () => {
    if (!clientId || !userId) {
      Alert.alert('Not ready', 'Your workspace is still being set up. Please try again shortly.');
      return;
    }
    setSaving(true);
    const { error } = await submitFollowupRequest(clientId, userId, {
      style,
      durationDays: duration,
      notes,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not submit', error);
      return;
    }
    Alert.alert(
      'Request sent 🎉',
      'The BaMo team will program BayMo’s follow-up plan and switch it on — you’ll get a notification once it’s active.',
      [{ text: 'Done', onPress: () => router.back() }],
    );
  };

  const showForm = !loading && (!existing || existing.status === 'rejected');

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
          Most leads go quiet before they buy. Turn this on and BayMo follows up with them for you
          — and stops the moment they reply, so it never talks over you.
        </Text>

        {loading ? (
          <ActivityIndicator color={BrandColors.navy} style={{ marginVertical: 24 }} />
        ) : existing && existing.status !== 'rejected' ? (
          <View
            style={[
              styles.statusCard,
              {
                borderColor:
                  existing.status === 'active' ? BrandColors.success : BrandColors.orange,
              },
            ]}>
            <Ionicons
              name={existing.status === 'active' ? 'checkmark-circle' : 'time-outline'}
              size={28}
              color={existing.status === 'active' ? BrandColors.success : BrandColors.orange}
            />
            <Text style={styles.statusTitle}>
              {existing.status === 'active'
                ? 'Auto Follow-Up is on'
                : 'The BaMo team is setting this up'}
            </Text>
            <Text style={styles.statusBody}>
              {FOLLOWUP_STYLES.find((s) => s.key === existing.style)?.label ?? existing.style} ·{' '}
              {existing.durationDays} days
            </Text>
            {!!existing.adminNotes && <Text style={styles.statusBody}>{existing.adminNotes}</Text>}
          </View>
        ) : null}

        {existing?.status === 'rejected' && (
          <View style={[styles.statusCard, { borderColor: BrandColors.error }]}>
            <Text style={styles.statusTitle}>Previous request needs attention</Text>
            {!!existing.adminNotes && <Text style={styles.statusBody}>{existing.adminNotes}</Text>}
            <Text style={styles.statusBody}>You can send a new request below.</Text>
          </View>
        )}

        {showForm && (
          <>
            <Text style={styles.section}>How persistent should BayMo be?</Text>
            {FOLLOWUP_STYLES.map((s) => {
              const active = style === s.key;
              return (
                <Pressable
                  key={s.key}
                  style={[styles.choice, active && styles.choiceActive]}
                  onPress={() => setStyle(s.key)}>
                  <View style={styles.choiceText}>
                    <Text style={[styles.choiceTitle, active && { color: BrandColors.navy }]}>
                      {s.label}
                    </Text>
                    <Text style={styles.choiceBody}>{s.description}</Text>
                  </View>
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={active ? BrandColors.navy : BrandColors.textMuted}
                  />
                </Pressable>
              );
            })}

            <Text style={styles.section}>For how long?</Text>
            <View style={styles.pillRow}>
              {FOLLOWUP_DURATIONS.map((d) => (
                <TagPill
                  key={d}
                  label={`${d} days`}
                  active={duration === d}
                  onPress={() => setDuration(d)}
                />
              ))}
            </View>

            <TextField
              label="Anything BayMo should know? (optional)"
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Don’t follow up with leads who already booked a viewing"
              multiline
              numberOfLines={3}
            />

            <Text style={styles.hint}>
              BayMo never messages during late-night quiet hours, and always stops when a lead
              replies or asks to stop.
            </Text>
          </>
        )}
      </ScrollView>

      {showForm && (
        <View style={styles.footer}>
          <Button
            label={saving ? 'Sending…' : 'Turn on Auto Follow-Up'}
            onPress={submit}
            style={{ width: '100%' }}
          />
        </View>
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
  lede: { ...TypeScale.body, color: BrandColors.textSecondary },
  section: { ...TypeScale.h4, color: BrandColors.textHeading, marginTop: 8 },
  hint: { ...TypeScale.bodySmall, color: BrandColors.textMuted, marginTop: 4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BrandColors.white,
    borderWidth: 1.5,
    borderColor: BrandColors.border,
    borderRadius: Radii.card,
    padding: 14,
  },
  choiceActive: { borderColor: BrandColors.navy },
  choiceText: { flex: 1, gap: 2 },
  choiceTitle: { ...TypeScale.bodyBold, color: BrandColors.textHeading },
  choiceBody: { ...TypeScale.bodySmall, color: BrandColors.textSecondary },
  statusCard: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: BrandColors.white,
    borderWidth: 1.5,
    borderRadius: Radii.card,
    padding: 16,
    marginVertical: 6,
  },
  statusTitle: { ...TypeScale.h4, color: BrandColors.textHeading },
  statusBody: { ...TypeScale.bodySmall, color: BrandColors.textSecondary, textAlign: 'center' },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
    backgroundColor: BrandColors.white,
  },
});
