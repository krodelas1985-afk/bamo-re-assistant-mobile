import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TagPill } from '@/components/ui/tag-pill';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import { AppointmentType, createAppointment, fetchLeadOptions } from '@/lib/appointments';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function NewAppointmentScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const clientId = profile?.client_id ?? null;

  const [type, setType] = useState<AppointmentType>('viewing');
  const [leads, setLeads] = useState<{ id: string; name: string }[]>([]);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLeadOptions().then(setLeads);
  }, []);

  const pickLead = (id: string, name: string) => {
    if (leadId === id) {
      setLeadId(null);
    } else {
      setLeadId(id);
      if (!contactName.trim()) setContactName(name);
    }
  };

  const setQuickDate = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    setDate(ymd(d));
  };

  const save = async () => {
    if (!clientId || !session?.user) {
      Alert.alert('Not ready', 'Your workspace is still being set up. Please try again shortly.');
      return;
    }
    if (!contactName.trim()) {
      Alert.alert('Who is it with?', 'Pick a lead or enter a contact name.');
      return;
    }
    const stamp = new Date(`${date}T${time || '00:00'}:00`);
    if (!date || Number.isNaN(stamp.getTime())) {
      Alert.alert('Check the date & time', 'Use date YYYY-MM-DD and time HH:MM (24-hour).');
      return;
    }
    setSaving(true);
    const { error } = await createAppointment(clientId, session.user.id, {
      lead_id: leadId,
      contact_name: contactName.trim(),
      contact_phone: contactPhone.trim() || null,
      appointment_type: type,
      scheduled_at: stamp.toISOString(),
      location: type === 'viewing' ? location.trim() || null : null,
      notes: notes.trim() || null,
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
        <Text style={styles.headerTitle}>Schedule appointment</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.fieldLabel}>Type</Text>
        <View style={styles.pillRow}>
          <TagPill label="🏡 Viewing" active={type === 'viewing'} onPress={() => setType('viewing')} />
          <TagPill label="📞 Call" active={type === 'call'} onPress={() => setType('call')} />
        </View>

        {leads.length > 0 && (
          <>
            <Text style={styles.fieldLabel}>Link a lead (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.pillRow}>
                {leads.map((l) => (
                  <TagPill key={l.id} label={l.name} active={leadId === l.id} onPress={() => pickLead(l.id, l.name)} />
                ))}
              </View>
            </ScrollView>
          </>
        )}

        <TextField label="Contact name" value={contactName} onChangeText={setContactName} placeholder="Juan Dela Cruz" autoCapitalize="words" />
        <TextField label="Contact number (optional)" value={contactPhone} onChangeText={setContactPhone} placeholder="0917 123 4567" keyboardType="phone-pad" />

        <Text style={styles.fieldLabel}>Date</Text>
        <View style={styles.pillRow}>
          <TagPill label="Today" onPress={() => setQuickDate(0)} />
          <TagPill label="Tomorrow" onPress={() => setQuickDate(1)} />
        </View>
        <TextField label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder="2026-07-05" keyboardType="numbers-and-punctuation" />
        <TextField label="Time (HH:MM, 24-hour)" value={time} onChangeText={setTime} placeholder="14:30" keyboardType="numbers-and-punctuation" />

        {type === 'viewing' && (
          <TextField label="Location" value={location} onChangeText={setLocation} placeholder="e.g. Vermira Lipa, Model unit" autoCapitalize="words" />
        )}
        <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Bringing spouse; confirm gate pass" multiline numberOfLines={3} />

        {!clientId && (
          <Text style={styles.warn}>Your workspace isn&apos;t linked yet, so saving is disabled. Finish onboarding first.</Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button label={saving ? 'Saving…' : 'Schedule'} onPress={save} style={styles.footerBtn} />
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
  warn: { ...TypeScale.bodySmall, color: BrandColors.error, marginTop: 4 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
    backgroundColor: BrandColors.white,
  },
  footerBtn: { width: '100%' },
});
