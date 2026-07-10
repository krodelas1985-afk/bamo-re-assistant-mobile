import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TagPill } from '@/components/ui/tag-pill';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, TypeScale } from '@/constants/brand';
import { LEAD_TYPE_OPTIONS, MANUAL_SOURCE_OPTIONS, createLead } from '@/lib/leads';

/** "4,500,000" / "4.5m" style input → number in pesos, or null. */
function parseAmount(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^([\d.,]+)\s*(m|k)?$/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if (Number.isNaN(n)) return null;
  return Math.round(n * (m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1_000 : 1));
}

export default function NewLeadScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const clientId = profile?.client_id ?? null;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState<string>('Manual');
  const [leadType, setLeadType] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState('');
  const [preferredLocation, setPreferredLocation] = useState('');
  const [timeframe, setTimeframe] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!clientId || !session?.user) {
      Alert.alert('Not ready', 'Your workspace is still being set up. Please try again shortly.');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Name is required', 'Enter the lead’s name so you can find them later.');
      return;
    }
    const min = parseAmount(budgetMin);
    const max = parseAmount(budgetMax);
    if ((budgetMin.trim() && min == null) || (budgetMax.trim() && max == null)) {
      Alert.alert('Check the budget', 'Use numbers like 4,500,000 or 4.5m.');
      return;
    }
    setSaving(true);
    const { error } = await createLead(clientId, session.user.id, {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      source,
      leadType,
      currentLocation: currentLocation.trim() || null,
      timeframe: timeframe.trim() || null,
      notes: notes.trim() || null,
      budgetMin: min,
      budgetMax: max,
      preferredLocation: preferredLocation.trim()
        ? preferredLocation
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : null,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error);
      return;
    }
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={BrandColors.textHeading} />
        </Pressable>
        <Text style={styles.headerTitle}>Add lead</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label="Name *"
          value={name}
          onChangeText={setName}
          placeholder="Juan Dela Cruz"
          autoCapitalize="words"
        />
        <TextField
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          placeholder="0917 123 4567"
          keyboardType="phone-pad"
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="juan@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.fieldLabel}>Source</Text>
        <View style={styles.pillRow}>
          {MANUAL_SOURCE_OPTIONS.map((s) => (
            <TagPill key={s} label={s} active={source === s} onPress={() => setSource(s)} />
          ))}
        </View>

        <Text style={styles.fieldLabel}>Type of lead (optional)</Text>
        <View style={styles.pillRow}>
          {LEAD_TYPE_OPTIONS.map((t) => (
            <TagPill
              key={t}
              label={t}
              active={leadType === t}
              onPress={() => setLeadType((cur) => (cur === t ? null : t))}
            />
          ))}
        </View>

        <TextField
          label="Current location"
          value={currentLocation}
          onChangeText={setCurrentLocation}
          placeholder="e.g. Lipa City"
          autoCapitalize="words"
        />
        <TextField
          label="Preferred location"
          value={preferredLocation}
          onChangeText={setPreferredLocation}
          placeholder="e.g. Batangas, Cavite (comma-separated)"
          autoCapitalize="words"
        />
        <TextField
          label="Timeframe"
          value={timeframe}
          onChangeText={setTimeframe}
          placeholder="e.g. 3 months, ASAP"
        />

        <View style={styles.twoCol}>
          <View style={styles.flex}>
            <TextField
              label="Budget min (₱)"
              value={budgetMin}
              onChangeText={setBudgetMin}
              placeholder="2,000,000"
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={styles.flex}>
            <TextField
              label="Budget max (₱)"
              value={budgetMax}
              onChangeText={setBudgetMax}
              placeholder="4.5m"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </View>

        <TextField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. Met at the open house; wants a corner lot near schools"
          multiline
          numberOfLines={3}
        />

        {!clientId && (
          <Text style={styles.warn}>
            Your workspace isn&apos;t linked yet, so saving is disabled. Finish onboarding first.
          </Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button label={saving ? 'Saving…' : 'Add lead'} onPress={save} style={styles.footerBtn} />
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
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  fieldLabel: { ...TypeScale.label, color: BrandColors.textSecondary },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  twoCol: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  warn: { ...TypeScale.bodySmall, color: BrandColors.error, marginTop: 4 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
    backgroundColor: BrandColors.white,
  },
  footerBtn: { width: '100%' },
});
