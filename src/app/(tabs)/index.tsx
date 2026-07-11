import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NotificationBell } from '@/components/notification-bell';
import { Screen } from '@/components/screen';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import { DailyDigest, fetchLatestDigest, visibleSuggestions } from '@/lib/digest';
import { LeadStats, TodayActivity, fetchLeadStats, fetchTodayActivity } from '@/lib/leads';
import { Task, completeTask, dueLabel, fetchTodayTasks, isOverdue, sourceMeta } from '@/lib/tasks';

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Magandang umaga,';
  if (hour < 18) return 'Magandang hapon,';
  return 'Magandang gabi,';
}

const DASH = '—';

/** "Today" / "Yesterday" / "Jul 9" for the digest's summarized day (Manila). */
function digestDateLabel(ymd: string): string {
  const manilaToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  if (ymd === manilaToday) return 'Today';
  const diff = Math.round(
    (new Date(`${manilaToday}T00:00:00+08:00`).getTime() - new Date(`${ymd}T00:00:00+08:00`).getTime()) / 864e5,
  );
  if (diff === 1) return 'Yesterday';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export default function HomeScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [today, setToday] = useState<TodayActivity | null>(null);
  const [digest, setDigest] = useState<DailyDigest | null>(null);

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
      fetchLatestDigest().then((d) => {
        if (active) setDigest(d);
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
          {today === null
            ? "BaMo is handling the follow-ups. Here's what needs your attention."
            : !today.automationActive
              ? `🌟 ${today.newToday} new lead${today.newToday === 1 ? '' : 's'} today · 🤖 BaMo automation is off — activate a campaign and let BaMo handle them`
              : today.newToday > 0 || today.baymoHandled > 0
                ? `🌟 ${today.newToday} new lead${today.newToday === 1 ? '' : 's'} today · 💬 BaMo replied to ${today.baymoHandled} lead${today.baymoHandled === 1 ? '' : 's'} today`
                : "BaMo is handling the follow-ups. Here's what needs your attention."}
        </Text>
      </View>

      {/* Morning digest — yesterday's summary, generated 6:15 AM Manila */}
      {digest && (
        <View style={styles.digestCard}>
          <View style={styles.digestHeader}>
            <Text style={styles.digestTitle}>☀️ Yesterday with BaMo</Text>
            <Text style={styles.digestDate}>{digestDateLabel(digest.digest_date)}</Text>
          </View>
          <Text style={styles.digestLine}>
            🌟 {digest.metrics.new_leads} new lead{digest.metrics.new_leads === 1 ? '' : 's'} · 💬 BaMo
            handled {digest.metrics.baymo_handled} · 🔥 {digest.metrics.turned_hot} turned Hot ·
            ✅ {digest.metrics.turned_warm} turned Warm
          </Text>
          {!digest.metrics.automation_active && (
            <View style={styles.digestNudge}>
              <Text style={styles.digestNudgeText}>
                🤖 BaMo automation is not active. Activate a campaign and BaMo will greet, qualify,
                and follow up your new leads for you.
              </Text>
            </View>
          )}
          {visibleSuggestions(digest, profile?.role ?? null, session?.user.id ?? null).map((s) => (
            <Pressable
              key={s.lead_id}
              style={styles.digestSuggestion}
              onPress={() => router.push({ pathname: '/lead/[id]', params: { id: s.lead_id } })}>
              <Text style={styles.digestSuggestionText} numberOfLines={1}>
                {s.temperature === 'Hot' ? '🔥' : '✅'} <Text style={styles.digestSuggestionName}>{s.name}</Text> — {s.reason}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={BrandColors.textMuted} />
            </Pressable>
          ))}
        </View>
      )}

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
  // Morning digest card
  digestCard: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: BrandColors.cream400,
  },
  digestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  digestTitle: { ...TypeScale.h4, color: BrandColors.textHeading },
  digestDate: { ...TypeScale.labelSmall, color: BrandColors.textMuted },
  digestLine: { ...TypeScale.body, color: BrandColors.textBody },
  digestNudge: {
    backgroundColor: BrandColors.cream100,
    borderRadius: Radii.button,
    padding: 10,
    borderWidth: 1,
    borderColor: BrandColors.orangeSoft,
  },
  digestNudgeText: { ...TypeScale.bodySmall, color: BrandColors.orangeDark },
  digestSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
  },
  digestSuggestionText: { ...TypeScale.body, color: BrandColors.textBody, flex: 1 },
  digestSuggestionName: { fontFamily: TypeScale.h4.fontFamily, color: BrandColors.textHeading },

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
