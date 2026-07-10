import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-time-picker';
import { TagPill } from '@/components/ui/tag-pill';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import {
  Task,
  TaskBucket,
  TeamMember,
  bucketOf,
  completeTask,
  daysFromToday,
  deferTask,
  deleteTask,
  dueLabel,
  fetchDoneTasks,
  fetchOpenTasks,
  fetchTeamMembers,
  isOverdue,
  reassignTask,
  sourceMeta,
} from '@/lib/tasks';

const TABS: { key: TaskBucket; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'deferred', label: 'Deferred' },
  { key: 'done', label: 'Done' },
];

const DEFER_OPTIONS = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
] as const;

/** Alert.alert is a no-op on web; confirm() keeps destructive actions guarded there. */
function confirmDelete(title: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`Delete "${title}"? This can't be undone.`)) onConfirm();
    return;
  }
  Alert.alert('Delete task?', `"${title}" will be removed for everyone.`, [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

export default function TasksScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const myId = session?.user.id ?? null;

  const [open, setOpen] = useState<Task[]>([]);
  const [done, setDone] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TaskBucket>('today');

  // Action sheets
  const [deferring, setDeferring] = useState<Task | null>(null);
  const [customDate, setCustomDate] = useState<Date | null>(null);
  const [assigning, setAssigning] = useState<Task | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);

  const load = useCallback(async () => {
    setError(null);
    const [o, d] = await Promise.all([fetchOpenTasks(), fetchDoneTasks()]);
    if (o.error) setError(o.error);
    setOpen(o.data);
    setDone(d.data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const visible = useMemo(() => {
    if (tab === 'done') return done;
    return open.filter((t) => bucketOf(t) === tab);
  }, [tab, open, done]);

  const counts = useMemo(() => {
    const c: Record<TaskBucket, number> = { today: 0, upcoming: 0, deferred: 0, done: done.length };
    for (const t of open) c[bucketOf(t)] += 1;
    return c;
  }, [open, done]);

  // Optimistically drop a task from the open list; reload on failure.
  const mutate = useCallback(
    async (id: string, fn: () => Promise<{ error: string | null }>) => {
      setOpen((prev) => prev.filter((t) => t.id !== id));
      const { error: e } = await fn();
      if (e) {
        Alert.alert('Could not update', e);
      }
      load();
    },
    [load],
  );

  const onDefer = (until: string) => {
    if (!deferring) return;
    const task = deferring;
    setDeferring(null);
    setCustomDate(null);
    mutate(task.id, () => deferTask(task.id, until));
  };

  const openAssign = async (task: Task) => {
    setAssigning(task);
    if (team.length === 0) setTeam(await fetchTeamMembers());
  };

  const onAssign = (member: TeamMember) => {
    if (!assigning) return;
    const task = assigning;
    setAssigning(null);
    mutate(task.id, () => reassignTask(task.id, member.id));
  };

  return (
    <Screen title="Tasks" onBack={() => router.back()}>
      <Pressable style={styles.addBtn} onPress={() => router.push('/task-new')}>
        <Ionicons name="add-circle" size={22} color={BrandColors.white} />
        <Text style={styles.addText}>Add task</Text>
      </Pressable>

      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <TagPill
            key={t.key}
            label={counts[t.key] > 0 ? `${t.label} (${counts[t.key]})` : t.label}
            active={tab === t.key}
            onPress={() => setTab(t.key)}
          />
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.navy} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Couldn&apos;t load your tasks.</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <Button label="Try again" small onPress={load} />
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {tab === 'today'
              ? 'Nothing due today — great job! 🎉'
              : tab === 'upcoming'
                ? 'No upcoming tasks.'
                : tab === 'deferred'
                  ? 'No deferred tasks.'
                  : 'No finished tasks yet.'}
          </Text>
        </View>
      ) : (
        visible.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            myId={myId}
            showActions={tab !== 'done'}
            onComplete={() => mutate(t.id, () => completeTask(t.id))}
            onDefer={() => setDeferring(t)}
            onAssign={() => openAssign(t)}
            onDelete={() => confirmDelete(t.title, () => mutate(t.id, () => deleteTask(t.id)))}
            onOpenLead={t.lead_id ? () => router.push(`/lead/${t.lead_id}`) : undefined}
          />
        ))
      )}

      {/* Defer sheet */}
      <Modal
        visible={deferring !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeferring(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDeferring(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Defer until</Text>
            <View style={styles.pillWrap}>
              {DEFER_OPTIONS.map((o) => (
                <TagPill key={o.label} label={o.label} cream onPress={() => onDefer(daysFromToday(o.days))} />
              ))}
            </View>
            <DateField
              label="Or pick a date"
              value={customDate}
              onChange={(d) => {
                setCustomDate(d);
                onDefer(d.toLocaleDateString('en-CA'));
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Assign sheet */}
      <Modal
        visible={assigning !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAssigning(null)}>
        <Pressable style={styles.backdrop} onPress={() => setAssigning(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Assign to</Text>
            {team.length === 0 ? (
              <ActivityIndicator color={BrandColors.navy} />
            ) : (
              team.map((m) => (
                <Pressable key={m.id} style={styles.memberRow} onPress={() => onAssign(m)}>
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberInitial}>
                      {(m.full_name ?? '?').trim().charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.memberName}>
                    {m.full_name ?? 'Teammate'}
                    {m.id === myId ? ' (me)' : ''}
                  </Text>
                </Pressable>
              ))
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function TaskCard({
  task,
  myId,
  showActions,
  onComplete,
  onDefer,
  onAssign,
  onDelete,
  onOpenLead,
}: {
  task: Task;
  myId: string | null;
  showActions: boolean;
  onComplete: () => void;
  onDefer: () => void;
  onAssign: () => void;
  onDelete: () => void;
  onOpenLead?: () => void;
}) {
  const src = sourceMeta(task, myId);
  const overdue = isOverdue(task);
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>{task.title}</Text>
          <Text style={[styles.cardDue, overdue && styles.cardDueOverdue]}>{dueLabel(task)}</Text>
          {task.lead_name ? (
            <Pressable onPress={onOpenLead} disabled={!onOpenLead}>
              <Text style={styles.cardLead}>👤 {task.lead_name}</Text>
            </Pressable>
          ) : null}
          {task.notes ? (
            <Text style={styles.cardNotes} numberOfLines={2}>
              {task.notes}
            </Text>
          ) : null}
        </View>
        <View style={[styles.chip, src.kind === 'baymo' && styles.chipBaymo]}>
          <Text style={[styles.chipText, src.kind === 'baymo' && styles.chipTextBaymo]}>{src.label}</Text>
        </View>
      </View>

      {showActions ? (
        <View style={styles.actions}>
          <Pressable style={[styles.action, styles.actionPrimary]} onPress={onComplete}>
            <Ionicons name="checkmark-circle-outline" size={18} color={BrandColors.white} />
            <Text style={styles.actionPrimaryText}>Done</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={onDefer}>
            <Ionicons name="time-outline" size={18} color={BrandColors.navy} />
            <Text style={styles.actionText}>Defer</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={onAssign}>
            <Ionicons name="person-add-outline" size={18} color={BrandColors.navy} />
            <Text style={styles.actionText}>Assign</Text>
          </Pressable>
          <Pressable style={styles.actionIcon} onPress={onDelete} hitSlop={6}>
            <Ionicons name="trash-outline" size={18} color={BrandColors.error} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BrandColors.orange,
    borderRadius: Radii.button,
    paddingVertical: 14,
  },
  addText: { ...TypeScale.button, color: BrandColors.white },
  tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { ...TypeScale.body, color: BrandColors.textSecondary, textAlign: 'center', paddingHorizontal: 24 },
  errorDetail: { ...TypeScale.bodySmall, color: BrandColors.textMuted, textAlign: 'center', paddingHorizontal: 24 },

  card: { backgroundColor: BrandColors.white, borderRadius: Radii.card, padding: 14, gap: 12 },
  cardTop: { flexDirection: 'row', gap: 10 },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { ...TypeScale.h4, color: BrandColors.textHeading },
  cardDue: { ...TypeScale.bodySmall, color: BrandColors.textSecondary },
  cardDueOverdue: { color: BrandColors.error, fontFamily: 'Poppins_600SemiBold' },
  cardLead: { ...TypeScale.bodySmall, color: BrandColors.navy, marginTop: 2 },
  cardNotes: { ...TypeScale.bodySmall, color: BrandColors.textMuted, marginTop: 2 },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: BrandColors.cream200,
    borderRadius: Radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipBaymo: { backgroundColor: BrandColors.navy },
  chipText: { ...TypeScale.labelSmall, color: BrandColors.textSecondary },
  chipTextBaymo: { color: BrandColors.white },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radii.button,
    backgroundColor: BrandColors.cream100,
  },
  actionPrimary: { backgroundColor: BrandColors.orange },
  actionPrimaryText: { ...TypeScale.bodyBold, color: BrandColors.white },
  actionText: { ...TypeScale.bodyBold, color: BrandColors.navy },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: Radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BrandColors.cream100,
  },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(19, 42, 92, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: BrandColors.white,
    borderRadius: Radii.cardLarge,
    padding: 16,
    gap: 12,
  },
  sheetTitle: { ...TypeScale.h4, color: BrandColors.textHeading },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: Radii.pill,
    backgroundColor: BrandColors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitial: { ...TypeScale.bodyBold, color: BrandColors.white },
  memberName: { ...TypeScale.body, color: BrandColors.textHeading },
});
