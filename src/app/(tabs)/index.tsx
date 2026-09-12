import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Pressable,
  ScrollView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotificationBell } from '@/components/notification-bell';
import { BayMoSpeechButton, useBayMoSpeech } from '@/components/baymo-speech';
import { ChatVoiceButton } from '@/components/chat-voice-button';
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
function BayMoRow({
  children,
  tinted = false,
  speechKey,
  speechText,
  speakingKey,
  disabled,
  onSpeak,
  showAvatar = false,
}: {
  children: React.ReactNode;
  tinted?: boolean;
  speechKey?: string;
  speechText?: string;
  speakingKey?: string | null;
  disabled?: boolean;
  onSpeak?: (key: string, text: string) => void;
  showAvatar?: boolean;
}) {
  return (
    <View style={rowStyles.row}>
      {showAvatar && <Image source={baymoHead} style={rowStyles.avatar} contentFit="cover" />}
      <View style={[rowStyles.bubble, tinted && rowStyles.bubbleTinted]}>
        <View style={{ flex: 1, gap: 8 }}>{children}</View>
        {!!speechKey && !!speechText && !!onSpeak && (
          <BayMoSpeechButton
            speaking={speakingKey === speechKey}
            disabled={disabled}
            onPress={() => onSpeak(speechKey, speechText)}
          />
        )}
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 18 },
  avatar: { width: 30, height: 30, borderRadius: Radii.pill },
  bubble: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: BrandColors.white,
    borderRadius: 20,
    padding: 14,
    gap: 8,
    ...CardShadow,
  },
  bubbleTinted: { backgroundColor: BrandColors.cream200, borderWidth: 1, borderColor: BrandColors.cream400 },
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
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState(false);
  const { speakingKey, playSpeech, stopSpeech } = useBayMoSpeech(setVoiceError);
  const interactionBusy = sending || voiceBusy;
  const lastBackPress = useRef(0);

  // Home is both the first tab and BayMo's chat room, so there is genuinely no
  // previous screen — Android's default is to close the app. Agents read that as
  // "back killed my chat", so require a confirming second press.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        const now = Date.now();
        if (now - lastBackPress.current < 2000) return false; // second press: let it exit
        lastBackPress.current = now;
        ToastAndroid.show('Press back again to exit BaMo', ToastAndroid.SHORT);
        return true;
      });
      return () => subscription.remove();
    }, []),
  );

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

  const [isFocused, setIsFocused] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const attemptedGreeting = useRef<string | null>(null);
  const greetingBody = stats && tasks
    ? `${stats.hot > 0 ? `You have ${stats.hot} hot ${stats.hot === 1 ? 'lead' : 'leads'} to follow up with. ` : ''}${tasks.length > 0 ? `There ${tasks.length === 1 ? 'is 1 task' : `are ${tasks.length} tasks`} waiting for your attention. ` : ''}How can I help you today?`
    : 'How can I help you today?';
  const greetingText = `${greetingForNow()}, ${displayName}! ${greetingBody}`;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
      if (state !== 'active') stopSpeech();
    });
    return () => subscription.remove();
  }, [stopSpeech]);
  useFocusEffect(useCallback(() => {
    setIsFocused(true);
    return () => { setIsFocused(false); stopSpeech(); };
  }, [stopSpeech]));
  const handleVoiceBusy = useCallback((busy: boolean) => {
    if (busy) stopSpeech();
    setVoiceBusy(busy);
  }, [stopSpeech]);

  useEffect(() => {
    if (!isFocused || !appActive || !session?.user.id || !stats || !tasks || interactionBusy || speakingKey || input) return;
    const now = new Date();
    const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const key = `baymo:dashboard-greeting:${session.user.id}`;
    const attempt = `${key}:${day}`;
    if (attemptedGreeting.current === attempt) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const lastDay = await AsyncStorage.getItem(key);
        if (cancelled) return;
        attemptedGreeting.current = attempt;
        if (lastDay === day) return;
        // Persist the attempt so failed audio cannot cause repeated greetings.
        await AsyncStorage.setItem(key, day);
        if (!cancelled) void playSpeech('greeting', greetingText);
      } catch {
        attemptedGreeting.current = attempt;
      }
    }, 800);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [appActive, greetingText, input, interactionBusy, isFocused, playSpeech, session?.user.id, speakingKey, stats, tasks]);

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
    async (
      text: string,
      task: QuickAction['task'] = 'chat',
      documentType?: string,
      speakReply = false,
    ) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const history: ChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
      setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
      setInput('');
      setVoiceDraft(false);
      setVoiceError(null);
      setSending(true);
      scrollToEnd();
      const { reply, error } = await sendToBayMo(
        [...history, { role: 'user', content: trimmed }],
        task,
        documentType,
      );
      const replyContent = error ? `Sorry, may problema — ${error}. Pakisubukan ulit.` : reply || '…';
      const replyKey = `message:${history.length + 1}`;
      setMessages((prev) => [...prev, { role: 'assistant', content: replyContent }]);
      if (speakReply && !error) void playSpeech(replyKey, replyContent);
      setSending(false);
      scrollToEnd();
    },
    [messages, sending, playSpeech],
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
        behavior="padding"
        automaticOffset>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.feed}>
          {/* Greeting */}
          <BayMoRow
            tinted
            speechKey="greeting"
            speechText={greetingText}
            disabled={interactionBusy}
            speakingKey={speakingKey}
            onSpeak={playSpeech}>
            <Text style={styles.greeting}>
              {greetingForNow()}, {displayName}!
            </Text>
            <Text style={styles.bodyText}>
              {greetingBody}
            </Text>
          </BayMoRow>

          {/* Urgent flags — a lead personally needs the agent (e.g. requested a
              call in the B2B campaign). BayMo messages the agent instead of email. */}
          {flags.length > 0 && (
            <View style={styles.flagRow}>
              <Image source={baymoHead} style={rowStyles.avatar} contentFit="cover" />
              <View style={styles.flagBubble}>
                <Text style={styles.flagHeading}>🔔 Needs your attention</Text>
                {flags.map((f) => (
                  <View key={f.id} style={styles.flagItem}>
                    <Pressable
                      style={{ flex: 1 }}
                      onPress={() => {
                        if (f.route) {
                          markNotificationRead(f.id);
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
                <BayMoSpeechButton
                  speaking={speakingKey === 'attention-flags'}
                  onPress={() => void playSpeech(
                    'attention-flags',
                    `Kailangan mo itong tingnan. ${flags.map((flag) => `${flag.title}. ${flag.body ?? ''}`).join('. ')}`,
                  )}
                />
              </View>
            </View>
          )}

          {/* Today's update */}
          {updateLine ? (
            <BayMoRow
              tinted
              speechKey="today-update"
              speechText={updateLine}
              speakingKey={speakingKey}
              onSpeak={playSpeech}>
              <Text style={styles.cardTitle}>Your daily update</Text>
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
            <BayMoRow
              speechKey="lead-summary"
              speechText={`${attentionCount > 0 ? `${attentionCount} leads need your attention.` : 'No leads are waiting on you right now.'} ${suggestions.map((s) => `${s.name}: ${s.reason}`).join('. ')}`}
              speakingKey={speakingKey}
              onSpeak={playSpeech}>
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
                  <Text style={styles.leadRowText} numberOfLines={2}>
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
            <BayMoRow
              speechKey="task-summary"
              speechText={tasks.length > 0
                ? `Your tasks for today are: ${tasks.map((task) => `${task.title}, ${dueLabel(task)}`).join('. ')}`
                : 'All clear for today. Walang pending tasks.'}
              speakingKey={speakingKey}
              onSpeak={playSpeech}>
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
                    <Text style={styles.taskTitle} numberOfLines={2}>
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
            <BayMoRow
              speechKey="announcements"
              speechText={`Heads up from BaMo. ${announcements.map((item) => `${item.title}. ${item.body ?? ''}`).join('. ')}`}
              speakingKey={speakingKey}
              onSpeak={playSpeech}>
              <Text style={styles.cardTitle}>📣 Heads up from BaMo</Text>
              {announcements.map((a) => (
                <View key={a.id} style={{ gap: 2 }}>
                  <Text style={styles.taskTitle} numberOfLines={2}>
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
              <BayMoRow
                key={i}
                showAvatar
                speechKey={`message:${i}`}
                speechText={m.content}
                speakingKey={speakingKey}
                onSpeak={playSpeech}>
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
                  disabled={interactionBusy}
                  style={[styles.quickPill, interactionBusy && styles.controlDisabled]}
                  onPress={() => send(qa.prompt, qa.task, qa.documentType)}>
                  <Text style={styles.quickPillText}>{qa.label}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
        {!!voiceError && (
          <Text accessibilityLiveRegion="polite" style={styles.voiceError}>{voiceError}</Text>
        )}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            accessibilityLabel="Message BayMo"
            value={input}
            onChangeText={(value) => {
              setInput(value);
              setVoiceError(null);
              if (!value.trim()) setVoiceDraft(false);
            }}
            placeholder="Message BayMo…"
            placeholderTextColor={BrandColors.textMuted}
            multiline
            editable={!interactionBusy}
            onSubmitEditing={() => send(input, 'chat', undefined, voiceDraft)}
          />
          <ChatVoiceButton
            disabled={sending}
            onBusyChange={handleVoiceBusy}
            onError={setVoiceError}
            onTranscript={(text) => {
              setInput(text);
              setVoiceDraft(true);
              setVoiceError(null);
            }}
          />
          <Pressable
            onPress={() => send(input, 'chat', undefined, voiceDraft)}
            disabled={interactionBusy || !input.trim()}
            style={[styles.sendBtn, (interactionBusy || !input.trim()) && styles.sendBtnDisabled]}>
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
  linkText: { ...TypeScale.bodyBold, color: BrandColors.orangeDark },

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
    backgroundColor: BrandColors.navy,
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
    maxWidth: '88%',
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
  controlDisabled: { opacity: 0.45 },
  voiceError: {
    ...TypeScale.helper,
    color: BrandColors.error,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
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
    borderRadius: 24,
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
    width: 46,
    height: 46,
    borderRadius: Radii.pill,
    backgroundColor: BrandColors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: BrandColors.disabled },
});
