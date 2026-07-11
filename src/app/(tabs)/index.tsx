import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NotificationBell } from '@/components/notification-bell';
import { Screen } from '@/components/screen';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import { LeadStats, TodayActivity, fetchLeadStats, fetchTodayActivity } from '@/lib/leads';
import { Task, completeTask, dueLabel, fetchTodayTasks, isOverdue, sourceMeta } from '@/lib/tasks';

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Magandang umaga,';
  if (hour < 18) return 'Magandang hapon,';
  return 'Magandang gabi,';
}

const DASH = '—';

export default function HomeScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [today, setToday] = useState<TodayActivity | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchLeadStats().then((s) => {
        if (active) setStats(s);
      });
      fetchTodayTasks().then((t) => {
        if (active) setTasks(t);
      });
      fetchTodayActivity().then((a) => {
        if (active) setToday(a);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const displayName =
    profile?.full_name?.split(/\s+/)[0] ?? session?.user.email?.split('@')[0] ?? 'Agent';

  const cards = [
    { label: 'New leads (7d)', value: stats ? String(stats.newThisWeek) : DASH },
    { label: 'Hot leads', value: stats ? String(stats.hot) : DASH },
    { label: 'Ready to follow up', value: stats ? String(stats.ready) : DASH },
    { label: 'For viewing', value: stats ? String(stats.forViewing) : DASH },
  ];

  const finishTask = async (id: string) => {
    setTasks((prev) => (prev ? prev.filter((t) => t.id !== id) : prev)); // optimistic
    await completeTask(id);
  };

  return (
    <Screen headerRight={<NotificationBell />}>
      <View style={styles.greetingCard}>
        <Text style={styles.greetingSmall}>{greetingForNow()}</Text>
        <Text style={styles.greetingName}>{displayName} 👋</Text>
        <Text style={styles.greetingBody}>
          {today && (today.newToday > 0 || today.baymoHandled > 0)
            ? `🌟 ${today.newToday} new lead${today.newToday === 1 ? '' : 's'} today · 💬 BaMo replied to ${today.baymoHandled} lead${today.baymoHandled === 1 ? '' : 's'} today`
            : "BaMo is handling the follow-ups. Here's what needs your attention."}
        </Text>
      </View>

      <View style={styles.statsGrid}>
        {cards.map((s) => (
          <View key={s.label} style={styles.statCard}>
            <Text style={styles.statLabel}>{s.label}</Text>
            <Text style={styles.statValue}>{s.value}</Text>
          </View>
        ))}
      </View>

      {/* Today's tasks */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Today&apos;s tasks</Text>
        <Pressable onPress={() => router.push('/tasks')} hitSlop={8}>
          <Text style={styles.sectionLink}>View all →</Text>
        </Pressable>
      </View>
      {tasks === null ? null : tasks.length === 0 ? (
        <View style={styles.taskEmpty}>
          <Text style={styles.taskEmptyText}>All clear for today 🎉 Add one anytime.</Text>
          <Pressable onPress={() => router.push('/task-new')} hitSlop={8}>
            <Text style={styles.sectionLink}>+ Add task</Text>
          </Pressable>
        </View>
      ) : (
        tasks.map((t) => {
          const src = sourceMeta(t, session?.user.id ?? null);
          return (
            <Pressable key={t.id} style={styles.taskCard} onPress={() => router.push('/tasks')}>
              <Pressable style={styles.taskCheck} onPress={() => finishTask(t.id)} hitSlop={8}>
                <Ionicons name="ellipse-outline" size={22} color={BrandColors.orange} />
              </Pressable>
              <View style={styles.taskText}>
                <Text style={styles.taskTitle} numberOfLines={1}>
                  {t.title}
                </Text>
                <Text style={[styles.taskMeta, isOverdue(t) && styles.taskMetaOverdue]} numberOfLines={1}>
                  {dueLabel(t)}
                  {t.lead_name ? ` · ${t.lead_name}` : ''}
                </Text>
              </View>
              <View style={[styles.taskChip, src.kind === 'baymo' && styles.taskChipBaymo]}>
                <Text style={[styles.taskChipText, src.kind === 'baymo' && styles.taskChipTextBaymo]}>
                  {src.label}
                </Text>
              </View>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  greetingCard: {
    backgroundColor: BrandColors.navyDeep,
    borderRadius: Radii.cardLarge,
    padding: 20,
    gap: 4,
  },
  greetingSmall: {
    ...TypeScale.body,
    color: BrandColors.cream300,
  },
  greetingName: {
    ...TypeScale.h2,
    color: BrandColors.white,
  },
  greetingBody: {
    ...TypeScale.body,
    color: BrandColors.cream200,
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 16,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 4,
  },
  statLabel: {
    ...TypeScale.label,
    color: BrandColors.textSecondary,
  },
  statValue: {
    ...TypeScale.h1,
    color: BrandColors.navy,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: { ...TypeScale.h3, color: BrandColors.textHeading },
  sectionLink: { ...TypeScale.bodyBold, color: BrandColors.orange },
  taskEmpty: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 16,
    gap: 6,
    alignItems: 'center',
  },
  taskEmptyText: { ...TypeScale.body, color: BrandColors.textSecondary },
  taskCard: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  taskCheck: { padding: 2 },
  taskText: { flex: 1, gap: 1 },
  taskTitle: { ...TypeScale.bodyBold, color: BrandColors.textHeading },
  taskMeta: { ...TypeScale.bodySmall, color: BrandColors.textMuted },
  taskMetaOverdue: { color: BrandColors.error },
  taskChip: {
    backgroundColor: BrandColors.cream200,
    borderRadius: Radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  taskChipBaymo: { backgroundColor: BrandColors.navy },
  taskChipText: { ...TypeScale.labelSmall, color: BrandColors.textSecondary },
  taskChipTextBaymo: { color: BrandColors.white },
});
