import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-time-picker';
import { TagPill } from '@/components/ui/tag-pill';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, TypeScale } from '@/constants/brand';
import { fetchLeadOptions } from '@/lib/appointments';
import { TeamMember, createTask, daysFromToday, fetchTeamMembers, manilaToday } from '@/lib/tasks';

// Matches the CRM's task-type vocabulary so both apps filter the same way.
const TYPES = [
  { value: 'Follow-up', label: '🔁 Follow-up' },
  { value: 'Call', label: '📞 Call' },
  { value: 'Email', label: '✉️ Email' },
  { value: 'Meeting', label: '🤝 Meeting' },
  { value: 'Other', label: '📌 Other' },
] as const;

export default function NewTaskScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const clientId = profile?.client_id ?? null;
  const myId = session?.user.id ?? null;

  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState<string>('Follow-up');
  const [leads, setLeads] = useState<{ id: string; name: string }[]>([]);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [due, setDue] = useState<Date | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLeadOptions().then(setLeads);
    fetchTeamMembers().then(setTeam);
  }, []);

  const setQuickDue = (days: number) => {
    const [y, m, d] = daysFromToday(days).split('-').map(Number);
    setDue(new Date(y, m - 1, d));
  };

  const save = async () => {
    if (!clientId || !myId) {
      Alert.alert('Not ready', 'Your workspace is still being set up. Please try again shortly.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Name the task', 'Give this task a short title, e.g. “Send brochure to Ana”.');
      return;
    }
    setSaving(true);
    const { error } = await createTask(clientId, myId, {
      title: title.trim(),
      notes: notes.trim() || null,
      due_date: due ? due.toLocaleDateString('en-CA') : manilaToday(),
      lead_id: leadId,
      task_type: taskType,
      assigned_to: assignee ?? myId,
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
        <Text style={styles.headerTitle}>New task</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label="What needs doing?"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Send Vermira brochure to Ana"
          autoCapitalize="sentences"
        />

        <Text style={styles.fieldLabel}>Type</Text>
        <View style={styles.pillRow}>
          {TYPES.map((t) => (
            <TagPill key={t.value} label={t.label} active={taskType === t.value} onPress={() => setTaskType(t.value)} />
          ))}
        </View>

        {leads.length > 0 && (
          <>
            <Text style={styles.fieldLabel}>Link a lead (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.pillRow}>
                {leads.map((l) => (
                  <TagPill
                    key={l.id}
                    label={l.name}
                    active={leadId === l.id}
                    onPress={() => setLeadId((cur) => (cur === l.id ? null : l.id))}
                  />
                ))}
              </View>
            </ScrollView>
          </>
        )}

        <Text style={styles.fieldLabel}>Due</Text>
        <View style={styles.pillRow}>
          <TagPill label="Today" onPress={() => setQuickDue(0)} />
          <TagPill label="Tomorrow" onPress={() => setQuickDue(1)} />
          <TagPill label="Next week" onPress={() => setQuickDue(7)} />
        </View>
        <DateField label="Due date" value={due} onChange={setDue} />

        {team.length > 1 && (
          <>
            <Text style={styles.fieldLabel}>Assign to</Text>
            <View style={styles.pillRow}>
              {team.map((m) => (
                <TagPill
                  key={m.id}
                  label={m.id === myId ? 'Me' : (m.full_name ?? 'Teammate')}
                  active={(assignee ?? myId) === m.id}
                  onPress={() => setAssignee(m.id)}
                />
              ))}
            </View>
          </>
        )}

        <TextField
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Any details worth remembering"
          multiline
          numberOfLines={3}
        />

        {!clientId && (
          <Text style={styles.warn}>Your workspace isn&apos;t linked yet, so saving is disabled. Finish onboarding first.</Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button label={saving ? 'Saving…' : 'Add task'} onPress={save} style={styles.footerBtn} />
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
