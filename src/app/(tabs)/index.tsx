import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotificationBell } from '@/components/notification-bell';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, BrandFonts, CardShadow, Radii, TypeScale } from '@/constants/brand';
import { AppNotification, fetchAttentionFlags, markNotificationRead } from '@/lib/notifications';
import { Announcement, fetchAnnouncements } from '@/lib/announcements';
import { DailyDigest, fetchLatestDigest, visibleSuggestions } from '@/lib/digest';
import { ChatMessage, QUICK_ACTIONS, QuickAction, sendToBayMo } from '@/lib/baymo-chat';
import { LeadStats, TodayActivity, fetchLeadStats, fetchTodayActivity } from '@/lib/leads';
import { Task, completeTask, dueLabel, fetchTodayTasks, isOverdue } from '@/lib/tasks';

const baymoHead = require('../../../assets/brand/baymo-head.png');

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Magandang umaga';
  if (hour < 18) return 'Magandang hapon';
  return 'Magandang gabi';
}

/** One assistant "message": avatar gutter + bubble-shaped content. */
function BayMoRow({ children, tinted = false }: { children: React.ReactNode; tinted?: boolean }) {
  return (
    <View style={rowStyles.row}>
      <Image source={baymoHead} style={rowStyles.avatar} contentFit="cover" />
      <View style={[rowStyles.bubble, tinted && rowStyles.bubbleTinted]}>{children}</View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 12 },
  avatar: { width: 30, height: 30, borderRadius: Radii.pill },
  bubble: {
    flex: 1,
    backgroundColor: BrandColors.white,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
    padding: 14,
    gap: 8,
    ...CardShadow,
  },
  bubbleTinted: { backgroundColor: BrandColors.coralSoft },
});

export default function HomeScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const scrollRef = useRef<ScrollView>(null);

  const [stats, setStats] = useState<LeadStats | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [today, setToday] = useState<TodayActivity | null>(null);
  const [digest, setDigest] = useState<DailyDigest | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [flags, setFlags] = useState<AppNotification[]>([]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

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
      fetchAnnouncements(2).then((a) => {
        if (active) setAnnouncements(a);
      });
      fetchAttentionFlags().then((f) => {
        if (active) setFlags(f);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const displayName =
    profile?.full_name?.split(/\s+/)[0] ?? session?.user.email?.split('@')[0] ?? 'Agent';

  // "Needs your attention" = Hot leads only (the ones worth calling today).
  // Warm/ready leads live under the Leads tab, not as an alarming Home count.
  const attentionCount = stats ? stats.hot : null;

  const dismissFlag = async (id: string) => {
    setFlags((prev) => prev.filter((f) => f.id !== id)); // optimistic
    await markNotificationRead(id);
  };
  const suggestions = digest
    ? visibleSuggestions(digest, profile?.role ?? null, session?.user.id ?? null)
    : [];

  const scrollToEnd = () =>
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);

  const send = useCallback(
    async (text: string, task: QuickAction['task'] = 'chat', documentType?: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const history: ChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
      setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
      setInput('');
      setSending(true);
      scrollToEnd();
      const { reply, error } = await sendToBayMo(
        [...history, { role: 'user', content: trimmed }],
        task,
        documentType,
      );
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: error ? `Sorry, may problema — ${error}. Pakisubukan ulit.` : reply || '…',
        },
      ]);
      setSending(false);
      scrollToEnd();
    },
    [messages, sending],
  );

  const finishTask = async (id: string) => {
    setTasks((prev) => (prev ? prev.filter((t) => t.id !== id) : prev)); // optimistic
    await completeTask(id);
  };

  const updateLine =
    today === null
      ? null
      : !today.automationActive
        ? `🌟 ${today.newToday} new lead${today.newToday === 1 ? '' : 's'} today. 🤖 Automation is off — activate a campaign and I'll handle them for you.`
        : today.newToday > 0 || today.baymoHandled > 0
          ? `🌟 ${today.newToday} new lead${today.newToday === 1 ? '' : 's'} today — I already replied to ${today.baymoHandled} of them. 💬`
          : "All quiet so far — I'm watching your channels and will follow up the moment a lead comes in. 👌";

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header — Home IS BayMo's chat room */}
      <View style={styles.header}>
        <View style={styles.headerAvatarWrap}>
          <Image source={baymoHead} style={styles.headerAvatar} contentFit="cover" />
          <View style={styles.headerOnlineDot} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>BayMo</Text>
          <Text style={styles.headerSub}>● Your AI assistant</Text>
        </View>
        <NotificationBell />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.feed}>
          {/* Greeting */}
          <BayMoRow>
            <Text style={styles.greeting}>
              {greetingForNow()}, {displayName}! 👋
            </Text>
            <Text style={styles.bodyText}>
              Kumusta? Here&apos;s where we are today — ask me anything or tap a shortcut below.
            </Text>
          </BayMoRow>

          {/* Urgent flags — a lead personally needs the agent (e.g. requested a
              call in the B2B campaign). BayMo messages the agent instead of email. */}
          {flags.length > 0 && (
            <View style={styles.flagRow}>
              <Image source={baymoHead} style={rowStyles.avatar} contentFit="cover" />
              <View style={styles.flagBubble}>
                <Text style={styles.flagHeading}>🔔 Uy, kailangan mo itong tingnan!</Text>
                {flags.map((f) => (
                  <View key={f.id} style={styles.flagItem}>
                    <Pressable
                      style={{ flex: 1 }}
                      onPress={() => {
                        if (f.route) {
                          markNotificationRead(f.id);
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          router.push(f.route as any);
                        }
                      }}>
                      <Text style={styles.flagTitle}>{f.title}</Text>
                      {f.body ? (
                        <Text style={styles.flagBody} numberOfLines={2}>
                          {f.body}
                        </Text>
                      ) : null}
                    </Pressable>
                    <Pressable onPress={() => dismissFlag(f.id)} hitSlop={8} style={styles.flagDone}>
                      <Ionicons name="checkmark" size={16} color={BrandColors.successDeep} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Today's update */}
          {updateLine ? (
            <BayMoRow tinted>
              <Text style={styles.bodyText}>{updateLine}</Text>
              {digest ? (
                <Text style={styles.metaText}>
                  Yesterday: 🌟 {digest.metrics.new_leads} new · 💬 handled{' '}
                  {digest.metrics.baymo_handled} · 🔥 {digest.metrics.turned_hot} hot · ✅{' '}
                  {digest.metrics.turned_warm} warm
                </Text>
              ) : null}
            </BayMoRow>
          ) : null}

          {/* Leads that need attention */}
          {attentionCount !== null && (
            <BayMoRow>
              <Text style={styles.cardTitle}>
                {attentionCount > 0
                  ? `🔥 ${attentionCount} lead${attentionCount === 1 ? '' : 's'} need${attentionCount === 1 ? 's' : ''} your attention`
                  : '✅ No leads waiting on you right now'}
              </Text>
              {suggestions.map((s) => (
                <Pressable
                  key={s.lead_id}
                  style={styles.leadRow}
                  onPress={() => router.push({ pathname: '/lead/[id]', params: { id: s.lead_id } })}>
                  <Text style={styles.leadRowText} numberOfLines={1}>
                    {s.temperature === 'Hot' ? '🔥' : '✅'}{' '}
                    <Text style={styles.leadRowName}>{s.name}</Text> — {s.reason}
                  </Text>
                  <Ionicons name="chevron-forward" size={15} color={BrandColors.textMuted} />
                </Pressable>
              ))}
              {attentionCount > 0 ? (
                <Pressable style={styles.bubbleCta} onPress={() => router.push('/leads')}>
                  <Text style={styles.bubbleCtaText}>Review leads</Text>
                  <Ionicons name="arrow-forward" size={14} color={BrandColors.white} />
                </Pressable>
              ) : null}
            </BayMoRow>
          )}

          {/* Today's tasks */}
          {tasks !== null && (
            <BayMoRow>
              <Text style={styles.cardTitle}>
                {tasks.length > 0
                  ? `📋 Your tasks for today (${tasks.length})`
                  : '🎉 All clear for today — walang pending tasks.'}
              </Text>
              {tasks.map((t) => (
                <View key={t.id} style={styles.taskRow}>
                  <Pressable onPress={() => finishTask(t.id)} hitSlop={8}>
                    <Ionicons name="ellipse-outline" size={20} color={BrandColors.coral} />
                  </Pressable>
                  <Pressable style={{ flex: 1 }} onPress={() => router.push('/tasks')}>
                    <Text style={styles.taskTitle} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text
                      style={[styles.metaText, isOverdue(t) && { color: BrandColors.error }]}
                      numberOfLines={1}>
                      {dueLabel(t)}
                      {t.lead_name ? ` · ${t.lead_name}` : ''}
                    </Text>
                  </Pressable>
                </View>
              ))}
              <Pressable onPress={() => router.push(tasks.length > 0 ? '/tasks' : '/task-new')}>
                <Text style={styles.linkText}>
                  {tasks.length > 0 ? 'View all tasks →' : '+ Add a task'}
                </Text>
              </Pressable>
            </BayMoRow>
          )}

          {/* Announcements */}
          {announcements.length > 0 && (
            <BayMoRow>
              <Text style={styles.cardTitle}>📣 Heads up from BaMo</Text>
              {announcements.map((a) => (
                <View key={a.id} style={{ gap: 2 }}>
                  <Text style={styles.taskTitle} numberOfLines={1}>
                    {a.pinned ? '📌 ' : ''}
                    {a.title}
                  </Text>
                  {!!a.body && (
                    <Text style={styles.bodyText} numberOfLines={3}>
                      {a.body}
                    </Text>
                  )}
                </View>
              ))}
            </BayMoRow>
          )}

          {/* Live conversation */}
          {messages.map((m, i) =>
            m.role === 'assistant' ? (
              <BayMoRow key={i}>
                <Text style={styles.bodyText}>{m.content}</Text>
              </BayMoRow>
            ) : (
              <View key={i} style={styles.userRow}>
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{m.content}</Text>
                </View>
              </View>
            ),
          )}
          {sending && (
            <BayMoRow>
              <ActivityIndicator color={BrandColors.coral} />
            </BayMoRow>
          )}
        </ScrollView>

        {/* Shortcuts + input — chat is always live on Home */}
        <View style={styles.quickRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.quickPills}>
              {QUICK_ACTIONS.map((qa) => (
                <Pressable
                  key={qa.label}
                  style={styles.quickPill}
                  onPress={() => send(qa.prompt, qa.task, qa.documentType)}>
                  <Text style={styles.quickPillText}>{qa.label}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message BayMo…"
            placeholderTextColor={BrandColors.textMuted}
            multiline
            onSubmitEditing={() => send(input)}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={sending || !input.trim()}
            style={[styles.sendBtn, (sending || !input.trim()) && styles.sendBtnDisabled]}>
            <Ionicons name="arrow-up" size={18} color={BrandColors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BrandColors.screenBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.border,
  },
  headerAvatarWrap: { width: 46, height: 46 },
  headerAvatar: { width: 46, height: 46, borderRadius: Radii.pill },
  headerOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: Radii.pill,
    backgroundColor: BrandColors.success,
    borderWidth: 2,
    borderColor: BrandColors.white,
  },
  headerTitle: { ...TypeScale.h2, color: BrandColors.ink },
  headerSub: {
    ...TypeScale.bodySmall,
    fontFamily: BrandFonts.semiBold,
    color: BrandColors.successDeep,
  },
  feed: { padding: 20, paddingBottom: 12 },

  // Urgent flag bubble (a lead needs the agent personally)
  flagRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 12 },
  flagBubble: {
    flex: 1,
    backgroundColor: BrandColors.coralSoft,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
    borderWidth: 1.5,
    borderColor: BrandColors.coral,
    padding: 14,
    gap: 8,
  },
  flagHeading: { ...TypeScale.bodyBold, color: BrandColors.coralDark },
  flagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: BrandColors.white,
    borderRadius: 12,
    padding: 10,
  },
  flagTitle: { ...TypeScale.bodyBold, color: BrandColors.ink },
  flagBody: { ...TypeScale.bodySmall, color: BrandColors.textSecondary, marginTop: 1 },
  flagDone: {
    width: 30,
    height: 30,
    borderRadius: Radii.pill,
    backgroundColor: BrandColors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  greeting: { ...TypeScale.h3, color: BrandColors.ink },
  bodyText: { ...TypeScale.body, color: BrandColors.ink },
  metaText: { ...TypeScale.bodySmall, color: BrandColors.textSecondary },
  cardTitle: { ...TypeScale.bodyBold, color: BrandColors.ink },
  linkText: { ...TypeScale.bodyBold, color: BrandColors.coral },

  leadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: BrandColors.borderLight,
  },
  leadRowText: { ...TypeScale.body, color: BrandColors.ink, flex: 1 },
  leadRowName: { fontFamily: BrandFonts.semiBold },
  bubbleCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: BrandColors.coral,
    borderRadius: Radii.pill,
    paddingVertical: 10,
    marginTop: 4,
  },
  bubbleCtaText: { ...TypeScale.bodyBold, color: BrandColors.white },

  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: BrandColors.borderLight,
  },
  taskTitle: { ...TypeScale.bodyBold, color: BrandColors.ink },

  userRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  userBubble: {
    maxWidth: '78%',
    backgroundColor: BrandColors.ink,
    borderRadius: 20,
    borderBottomRightRadius: 4,
    padding: 13,
  },
  userText: { ...TypeScale.body, color: BrandColors.white },

  quickRow: { paddingHorizontal: 16, paddingBottom: 6 },
  quickPills: { flexDirection: 'row', gap: 8 },
  quickPill: {
    backgroundColor: BrandColors.white,
    borderWidth: 1,
    borderColor: BrandColors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radii.pill,
  },
  quickPillText: { ...TypeScale.label, color: BrandColors.ink },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 6,
    backgroundColor: BrandColors.white,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: BrandColors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 36,
    paddingHorizontal: 8,
    paddingVertical: 8,
    ...TypeScale.body,
    color: BrandColors.ink,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: Radii.pill,
    backgroundColor: BrandColors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: BrandColors.disabled },
});
