import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/auth-context';
import { getChatHistory } from '@/lib/chat-history';
import { LeadChatPanel } from '@/components/lead-chat-panel';
import { fetchLeadDetail, type LeadDetail } from '@/lib/leads';
import type { LeadChatContext, UiMessage } from '@/lib/chat-history-store';
import { TagPill } from '@/components/ui/tag-pill';
import { ChatVoiceButton } from '@/components/chat-voice-button';
import { BayMoSpeechButton, useBayMoSpeech } from '@/components/baymo-speech';
import {
  ChatMessage,
  PendingAction,
  QUICK_ACTIONS,
  QuickAction,
  executePendingAction,
  sendToBayMo,
} from '@/lib/baymo-chat';
import {
  BrandColors,
  BrandFonts,
  CardShadow,
  Radii,
  TypeScale,
} from '@/constants/brand';

const baymoAvatar = require('../../assets/brand/baymo-head.png');

const GREETING: UiMessage = {
  role: 'assistant',
  content:
    "Kumusta! 👋 I'm BayMo. Ask me about your leads, or tap a shortcut below to get started.",
};

const INITIAL_MESSAGES = [GREETING];
const LEAD_QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Summarize this lead',
    prompt:
      'Summarize this lead using their current profile and qualification details.',
    task: 'chat',
  },
  {
    label: 'Show recent conversation',
    prompt:
      'Review this lead’s recent conversation and summarize what they asked and what still needs attention.',
    task: 'chat',
  },
];

function pendingActionDetails(action: PendingAction): string {
  if (action.type === 'enroll_campaign') {
    return `${action.lead_name} → ${action.campaign_name}`;
  }
  const schedule = action.type === 'create_task'
    ? `Due: ${action.due_date || 'No due date'}`
    : `${action.appointment_type} · ${new Date(action.scheduled_at!).toLocaleString(
        'en-PH',
        {
          timeZone: 'Asia/Manila',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        },
      )} (Manila)`;
  return [
    action.title,
    action.lead_name || action.contact_name,
    schedule,
    action.location,
    action.notes,
  ].filter(Boolean).join('\n');
}

function editActionPrompt(action: PendingAction): string {
  if (action.type === 'enroll_campaign') return '';
  return `Change this proposed ${action.type === 'create_task' ? 'task' : 'appointment'}:\n${pendingActionDetails(action)}\nChange: `;
}

export default function ChatScreen() {
  const { session } = useAuth();
  const { leadId: routeLeadId } = useLocalSearchParams<{ leadId?: string }>();
  const leadId =
    typeof routeLeadId === 'string' && routeLeadId.trim()
      ? routeLeadId
      : undefined;
  if (!session?.user.id)
    return (
      <SafeAreaView>
        <Text>Please sign in to chat with BayMo.</Text>
      </SafeAreaView>
    );
  return (
    <AccountChatScreen
      key={`${session.user.id}:${leadId ?? 'general'}`}
      userId={session.user.id}
      leadId={leadId}
    />
  );
}

function AccountChatScreen({
  userId,
  leadId,
}: {
  userId: string;
  leadId?: string;
}) {
  const router = useRouter();

  const leaveChat = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  // Android back: BayMo chat can be reached from a lead, Settings, the welcome
  // tour or the floating bubble. If this screen is the only one on the stack,
  // expo-router reports nothing to pop and React Native finishes the activity —
  // the app closes instead of leaving the chat. Send the agent Home instead.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        leaveChat();
        return true;
      });
      return () => subscription.remove();
    }, [leaveChat]),
  );
  const { seed } = useLocalSearchParams<{ seed?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const store = getChatHistory(userId);
  const saved = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftContext, setDraftContext] = useState<LeadChatContext | undefined>(
    leadId ? { leadId, leadName: 'Selected lead' } : undefined,
  );
  const [initialized, setInitialized] = useState(false);
  const openedLead = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void store.load().then(() => {
      if (cancelled || !store.getSnapshot().ready || openedLead.current) return;
      openedLead.current = true;
      if (leadId) {
        const previous = store
          .getSnapshot()
          .conversations.find((c) => c.context?.leadId === leadId);
        if (previous) {
          setActiveId(previous.id);
          setDraftContext(previous.context);
        }
      }
      setInitialized(true);
    });
    return () => {
      cancelled = true;
    };
  }, [store, saved.ready, leadId]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const active = saved.conversations.find((c) => c.id === activeId);
  const context = active?.context ?? draftContext;
  const selectedLeadId = context?.leadId;
  const [leadState, setLeadState] = useState<{
    id?: string;
    revision?: number;
    data: LeadDetail | null;
    error: string | null;
  }>({ data: null, error: null });
  const [leadRetry, setLeadRetry] = useState(0);
  useFocusEffect(
    useCallback(() => {
      if (!selectedLeadId) return;
      let cancelled = false;
      setLeadState({
        id: selectedLeadId,
        revision: leadRetry,
        data: null,
        error: null,
      });
      fetchLeadDetail(selectedLeadId)
        .then(({ data, error }) => {
          if (!cancelled)
            setLeadState({
              id: selectedLeadId,
              revision: leadRetry,
              data,
              error: error
                ? 'Could not refresh this lead. Please retry.'
                : data
                  ? null
                  : 'This lead is no longer available to you. Open another lead or start a general chat.',
            });
        })
        .catch(() => {
          if (!cancelled)
            setLeadState({
              id: selectedLeadId,
              revision: leadRetry,
              data: null,
              error: 'Could not refresh this lead. Please retry.',
            });
        });
      return () => {
        cancelled = true;
      };
    }, [selectedLeadId, leadRetry]),
  );
  const contextReady =
    !context ||
    (leadState.id === selectedLeadId && !!leadState.data && !leadState.error);
  const ready = saved.ready && initialized && contextReady;
  const contextName =
    leadState.id === selectedLeadId && leadState.data
      ? leadState.data.name
      : (context?.leadName ?? '');
  const messages = active?.messages.length ? active.messages : INITIAL_MESSAGES;
  const sending = saved.busy;
  useEffect(() => {
    void store.load();
  }, [store]);
  const [input, setInput] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState(false);
  const { speakingKey, playSpeech } = useBayMoSpeech(setVoiceError);
  const interactionBusy = sending || voiceBusy;
  const seededRef = useRef(false);

  const scrollToEnd = () =>
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

  const send = useCallback(
    async (
      text: string,
      task: QuickAction['task'] = 'chat',
      documentType?: string,
      speakReply = false,
    ) => {
      const trimmed = text.trim();
      if (!trimmed || store.getSnapshot().busy || !ready) return;
      const userMsg: UiMessage = { role: 'user', content: trimmed };
      // Server history is text-only: strip the greeting and any card metadata.
      const history: ChatMessage[] = messages
        .filter((m) => m !== GREETING)
        .map((m) => ({ role: m.role, content: m.content }));
      const currentContext = context
        ? { ...context, leadName: contextName }
        : undefined;
      const conversationId = activeId ?? store.create(trimmed, currentContext);
      if (activeId && currentContext)
        store.setContext(activeId, currentContext);
      setActiveId(conversationId);
      store.update(conversationId, (prev) => [...prev, userMsg]);
      setInput('');
      setVoiceDraft(false);
      setVoiceError(null);
      store.setBusy(true);
      scrollToEnd();

      try {
        const { reply, pendingAction, error } = await sendToBayMo(
          [...history, { role: 'user', content: trimmed }],
          task,
          documentType,
          currentContext,
        );
        let replyIndex = -1;
        const replyContent = error
          ? `Sorry, may problema — ${error}. Pakisubukan ulit.`
          : reply || '…';
        store.update(conversationId, (prev) => {
          replyIndex = prev.length;
          return [...prev, {
            role: 'assistant',
            content: replyContent,
            ...(pendingAction && !error
              ? { pending: pendingAction, pendingState: 'open' as const }
              : {}),
          }];
        });
        if (speakReply && !error) {
          void playSpeech(`${conversationId}:${replyIndex}`, replyContent);
        }
      } catch {
        store.update(conversationId, (prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Could not reach BayMo. Please try again.',
          },
        ]);
      } finally {
        store.setBusy(false);
      }
      scrollToEnd();
    },
    [messages, activeId, ready, context, contextName, store, playSpeech],
  );

  // Welcome-tour handoff: /chat?seed=… auto-sends the user's "how can I help"
  // answer as their first message so BayMo opens with context. Once only.
  useEffect(() => {
    if (seededRef.current || !ready) return;
    if (typeof seed === 'string' && seed.trim()) {
      // Next tick: sending inside the effect body would setState mid-render.
      const t = setTimeout(() => {
        if (seededRef.current || store.getSnapshot().busy) return;
        seededRef.current = true;
        void send(seed.trim());
      }, 0);
      return () => clearTimeout(t);
    }
  }, [seed, send, ready, store]);

  /**
   * Confirm on an action card → model-free execute call, then show the result.
   * Cards are addressed by index — the messages array is append-only, so the
   * index is stable across the async gap.
   */
  const confirmAction = useCallback(
    async (index: number, pending: PendingAction) => {
      if (!activeId || store.getSnapshot().busy) return;
      const conversationId = activeId;
      const updateCard = (state: UiMessage['pendingState']) =>
        store.update(conversationId, (prev) =>
          prev.map((m, i) => (i === index ? { ...m, pendingState: state } : m)),
        );
      store.setBusy(true);
      updateCard('working');
      try {
        const { ok, message } = await executePendingAction(pending);
        updateCard(
          ok
            ? 'confirmed'
            : pending.type === 'enroll_campaign'
              ? 'expired'
              : 'open',
        );
        store.update(conversationId, (prev) => [
          ...prev,
          {
            role: 'assistant',
            content: ok ? message : `Save not confirmed — ${message}`,
          },
        ]);
      } catch {
        updateCard(pending.type === 'enroll_campaign' ? 'expired' : 'open');
        store.update(conversationId, (prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              pending.type === 'enroll_campaign'
                ? 'Could not verify enrollment. Check the lead before trying again.'
                : 'Could not verify the save. Tap Confirm on this same card to retry safely. Check Tasks or Calendar before making a replacement.',
          },
        ]);
      } finally {
        store.setBusy(false);
      }
      scrollToEnd();
    },
    [activeId, store],
  );

  const cancelAction = useCallback(
    (index: number) => {
      if (!activeId || store.getSnapshot().busy) return;
      store.update(activeId, (prev) =>
        prev.map((m, i) =>
          i === index ? { ...m, pendingState: 'cancelled' } : m,
        ),
      );
    },
    [activeId, store],
  );

  const newChat = () => {
    setDraftContext(context);
    setActiveId(null);
    setInput('');
    setHistoryOpen(false);
    setDeleteId(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave BayMo chat"
          onPress={leaveChat}
          hitSlop={12}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={20} color={BrandColors.ink} />
        </Pressable>
        <View style={styles.headerAvatarWrap}>
          <Image
            source={baymoAvatar}
            style={styles.headerAvatar}
            contentFit="cover"
          />
          <View style={styles.headerOnlineDot} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.headerTitle}>BayMo</Text>
          <Text numberOfLines={1} style={styles.headerSub}>
            {active?.title ?? '● Your AI assistant'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chat history"
          onPress={() => setHistoryOpen(true)}
          style={styles.toolbarButton}
        >
          <Ionicons name="time-outline" size={22} color={BrandColors.ink} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New chat"
          disabled={!saved.ready || sending}
          onPress={newChat}
          style={styles.toolbarButton}
        >
          <Ionicons
            name="add"
            size={24}
            color={
              !saved.ready || sending ? BrandColors.textMuted : BrandColors.ink
            }
          />
        </Pressable>
      </View>
      <Text
        style={[
          styles.historyHelp,
          { paddingHorizontal: 20, paddingVertical: 6 },
        ]}
      >
        Last 5 chats saved on this device · View history using the clock
      </Text>
      {saved.error && (
        <View style={styles.historyNotice}>
          <Text style={styles.noticeText}>{saved.error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void store.retry()}
          >
            <Text style={styles.confirmBtnText}>Retry</Text>
          </Pressable>
        </View>
      )}
      {!saved.ready && !saved.error && (
        <ActivityIndicator
          accessibilityLabel="Loading saved chats"
          color={BrandColors.navy}
        />
      )}
      <Modal
        visible={historyOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setHistoryOpen(false);
          setDeleteId(null);
        }}
      >
        <View style={styles.historyOverlay}>
          <SafeAreaView style={styles.historySheet}>
            <View style={styles.historyHeading}>
              <Text style={styles.headerTitle}>Recent chats</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close history"
                style={styles.toolbarButton}
                onPress={() => {
                  setHistoryOpen(false);
                  setDeleteId(null);
                }}
              >
                <Ionicons name="close" size={24} color={BrandColors.ink} />
              </Pressable>
            </View>
            <Text style={styles.historyHelp}>
              Your last 5 conversations are saved on this device. Starting a
              sixth replaces the least recently updated chat.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={!saved.ready || sending}
              style={[
                styles.newChatButton,
                (!saved.ready || sending) && styles.btnDisabled,
              ]}
              onPress={newChat}
            >
              <Text style={styles.confirmBtnText}>+ New chat</Text>
            </Pressable>
            <ScrollView
              contentContainerStyle={{ gap: 10, paddingVertical: 14 }}
            >
              {saved.ready && saved.conversations.length === 0 && (
                <Text style={styles.historyHelp}>
                  No saved chats yet. Send BayMo a message to start one.
                </Text>
              )}
              {!saved.ready && (
                <Text style={styles.historyHelp}>
                  {saved.error ?? 'Loading your chats…'}
                </Text>
              )}
              {saved.conversations.map((chat) => (
                <View
                  key={chat.id}
                  style={[
                    styles.historyItem,
                    chat.id === activeId && { borderColor: BrandColors.orange },
                  ]}
                >
                  <View style={styles.historyHeading}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open chat: ${chat.title}`}
                      disabled={interactionBusy}
                      style={styles.flex}
                      onPress={() => {
                        setDraftContext(chat.context);
                        setActiveId(chat.id);
                        setInput('');
                        setHistoryOpen(false);
                        setDeleteId(null);
                        scrollToEnd();
                      }}
                    >
                      <Text numberOfLines={2} style={styles.actionStrong}>
                        {chat.title}
                      </Text>
                      <Text style={styles.historyHelp}>
                        {chat.context ? `${chat.context.leadName} · ` : ''}
                        {new Date(chat.updatedAt).toLocaleString()}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete chat: ${chat.title}`}
                      disabled={interactionBusy}
                      style={styles.toolbarButton}
                      onPress={() => setDeleteId(chat.id)}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={19}
                        color={BrandColors.error}
                      />
                    </Pressable>
                  </View>
                  {deleteId === chat.id && (
                    <View style={{ gap: 8 }}>
                      <Text style={styles.historyHelp}>
                        Delete this conversation? Created tasks and appointments
                        will remain.
                      </Text>
                      <View style={styles.actionButtons}>
                        <Pressable
                          accessibilityRole="button"
                          disabled={interactionBusy}
                          style={styles.cancelBtn}
                          onPress={() => setDeleteId(null)}
                        >
                          <Text>Keep chat</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          disabled={interactionBusy}
                          style={styles.confirmBtn}
                          onPress={() => {
                            store.remove(chat.id);
                            if (activeId === chat.id) {
                              setDraftContext(chat.context);
                              setActiveId(null);
                              setInput('');
                            }
                            setDeleteId(null);
                          }}
                        >
                          <Text style={styles.confirmBtnText}>Delete chat</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
            {sending && (
              <Text style={styles.historyHelp}>
                Wait for BayMo to finish before switching or deleting chats.
              </Text>
            )}
          </SafeAreaView>
        </View>
      </Modal>

      {context && (
        <>
          <LeadChatPanel
            key={context.leadId}
            context={context}
            name={contextName}
            loading={
              leadState.id !== selectedLeadId ||
              (!leadState.data && !leadState.error)
            }
            error={leadState.id === selectedLeadId ? leadState.error : null}
            disabled={!ready || interactionBusy}
            onRetry={() => setLeadRetry((n) => n + 1)}
            onProperty={(listing) => {
              const next = {
                leadId: context.leadId,
                leadName: contextName,
                ...(listing
                  ? { listingId: listing.id, listingTitle: listing.title }
                  : {}),
              };
              if (activeId) store.setContext(activeId, next);
              else setDraftContext(next);
            }}
            onTask={() => void send(
              'Create a follow-up task for this lead. Ask me what needs doing and whether it needs a due date.',
            )}
            onAppointment={() => void send(
              'Schedule an appointment for this lead. Ask me for any missing type, date, time, and location or call method.',
            )}
          />
          <Pressable
            accessibilityRole="button"
            disabled={interactionBusy}
            onPress={() => {
              setActiveId(null);
              setDraftContext(undefined);
              setInput('');
            }}
            style={{
              alignSelf: 'flex-end',
              paddingHorizontal: 20,
              paddingBottom: 6,
            }}
          >
            <Text style={styles.historyHelp}>Start general chat</Text>
          </Pressable>
        </>
      )}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        automaticOffset
      >
        <ScrollView ref={scrollRef} contentContainerStyle={styles.messages}>
          {messages.map((m, i) => (
            <View
              key={i}
              style={[
                styles.row,
                m.role === 'user' ? styles.rowUser : styles.rowAssistant,
              ]}
            >
              {m.role === 'assistant' && (
                <Image
                  source={baymoAvatar}
                  style={styles.bubbleAvatar}
                  contentFit="cover"
                />
              )}
              <View
                style={[
                  styles.bubble,
                  m.role === 'user' ? styles.userBubble : styles.botBubble,
                ]}
              >
                <Text
                  style={m.role === 'user' ? styles.userText : styles.botText}
                >
                  {m.content}
                </Text>
                {m.role === 'assistant' && !!m.content && (
                  <BayMoSpeechButton
                    speaking={speakingKey === `${activeId ?? 'new'}:${i}`}
                    onPress={() => void playSpeech(
                      `${activeId ?? 'new'}:${i}`,
                      m.content,
                    )}
                  />
                )}
                {m.pending && (
                  <View style={styles.actionCard}>
                    <Text style={styles.actionTitle}>
                      {m.pending.type === 'enroll_campaign'
                        ? 'Enroll in campaign'
                        : m.pending.type === 'create_task'
                          ? 'Create task'
                          : 'Schedule appointment'}
                    </Text>
                    <Text style={styles.actionBody}>
                      {pendingActionDetails(m.pending)}
                    </Text>
                    {!!m.pending.warning && (
                      <Text style={styles.actionWarning}>
                        ⚠️ {m.pending.warning}
                      </Text>
                    )}
                    {m.pendingState === 'confirmed' ? (
                      <View>
                        <Text style={styles.actionDone}>✅ {m.pending.type === 'enroll_campaign' ? 'Enrolled' : 'Saved'}</Text>
                        {m.pending.type !== 'enroll_campaign' && (
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => router.push(
                              m.pending!.type === 'create_task' ? '/tasks' : '/calendar',
                            )}
                          >
                            <Text style={styles.cancelBtnText}>
                              {m.pending.type === 'create_task'
                                ? 'View task'
                                : 'View appointment'}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    ) : m.pendingState === 'cancelled' ? (
                      <Text style={styles.actionCancelled}>Cancelled</Text>
                    ) : m.pendingState === 'expired' ? (
                      <Text style={styles.actionCancelled}>
                        Previous proposal — ask BayMo again to check its current
                        status.
                      </Text>
                    ) : (
                      <View style={styles.actionButtons}>
                        <Pressable
                          onPress={() => confirmAction(i, m.pending!)}
                          disabled={interactionBusy}
                          style={[
                            styles.confirmBtn,
                            m.pendingState === 'working' && styles.btnDisabled,
                          ]}
                        >
                          {m.pendingState === 'working' ? (
                            <ActivityIndicator
                              color={BrandColors.white}
                              size="small"
                            />
                          ) : (
                            <Text style={styles.confirmBtnText}>Confirm</Text>
                          )}
                        </Pressable>
                        {m.pending.type !== 'enroll_campaign' && (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Edit proposal"
                            onPress={() => {
                              cancelAction(i);
                              setInput(editActionPrompt(m.pending!));
                            }}
                            disabled={interactionBusy}
                            style={styles.cancelBtn}
                          >
                            <Text style={styles.cancelBtnText}>Edit</Text>
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => cancelAction(i)}
                          disabled={interactionBusy}
                          style={styles.cancelBtn}
                        >
                          <Text style={styles.cancelBtnText}>Cancel</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>
          ))}
          {sending && (
            <View style={[styles.row, styles.rowAssistant]}>
              <Image
                source={baymoAvatar}
                style={styles.bubbleAvatar}
                contentFit="cover"
              />
              <View style={[styles.bubble, styles.botBubble]}>
                <ActivityIndicator color={BrandColors.navy} />
              </View>
            </View>
          )}
        </ScrollView>

        <View style={styles.quickRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.quickPills}>
              {(context ? LEAD_QUICK_ACTIONS : QUICK_ACTIONS).map((qa) => (
                <TagPill
                  key={qa.label}
                  label={qa.label}
                  onPress={
                    ready && !interactionBusy
                      ? () => send(qa.prompt, qa.task, qa.documentType)
                      : undefined
                  }
                />
              ))}
            </View>
          </ScrollView>
        </View>

        {!!voiceError && (
          <Text accessibilityLiveRegion="polite" style={styles.voiceError}>
            {voiceError}
          </Text>
        )}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={(value) => {
              setInput(value);
              setVoiceError(null);
              if (!value.trim()) setVoiceDraft(false);
            }}
            placeholder="Message BayMo…"
            placeholderTextColor={BrandColors.textMuted}
            multiline
            editable={ready && !interactionBusy}
            onSubmitEditing={() => send(input, 'chat', undefined, voiceDraft)}
          />
          <ChatVoiceButton
            disabled={!ready || sending}
            onBusyChange={setVoiceBusy}
            onError={setVoiceError}
            onTranscript={(text) => {
              setInput(text);
              setVoiceDraft(true);
              setVoiceError(null);
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            onPress={() => send(input, 'chat', undefined, voiceDraft)}
            disabled={!ready || interactionBusy || !input.trim()}
            style={[
              styles.sendBtn,
              (!ready || interactionBusy || !input.trim()) && styles.sendBtnDisabled,
            ]}
          >
            <Ionicons name="arrow-up" size={20} color={BrandColors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  newChatButton: {
    minHeight: 44,
    flexShrink: 0,
    borderRadius: Radii.pill,
    backgroundColor: BrandColors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarButton: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  historySheet: {
    height: '80%',
    padding: 20,
    gap: 12,
    backgroundColor: BrandColors.screenBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  historyHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  historyHelp: { ...TypeScale.bodySmall, color: BrandColors.textMuted },
  historyItem: {
    padding: 12,
    borderWidth: 1,
    borderColor: BrandColors.border,
    borderRadius: Radii.card,
    backgroundColor: BrandColors.white,
    gap: 8,
  },
  historyNotice: {
    padding: 12,
    backgroundColor: BrandColors.ink,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  noticeText: { ...TypeScale.bodySmall, color: BrandColors.white, flex: 1 },
  safe: { flex: 1, backgroundColor: BrandColors.screenBg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.border,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: BrandColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...CardShadow,
  },
  headerAvatarWrap: { width: 46, height: 46 },
  headerAvatar: {
    width: 46,
    height: 46,
    borderRadius: Radii.pill,
  },
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
  messages: { padding: 16, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    maxWidth: '100%',
  },
  rowUser: { justifyContent: 'flex-end' },
  rowAssistant: { justifyContent: 'flex-start' },
  bubbleAvatar: { width: 28, height: 28, borderRadius: Radii.pill },
  bubble: { maxWidth: '78%', borderRadius: 20, padding: 13, ...CardShadow },
  userBubble: { backgroundColor: BrandColors.ink, borderBottomRightRadius: 4 },
  botBubble: {
    backgroundColor: BrandColors.white,
    borderBottomLeftRadius: 4,
  },
  userText: { ...TypeScale.body, color: BrandColors.white },
  botText: { ...TypeScale.body, color: BrandColors.textBody },
  // Action proposal card (Confirm/Cancel) inside a BayMo bubble
  actionCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: Radii.card,
    backgroundColor: BrandColors.cream100,
    borderWidth: 1,
    borderColor: BrandColors.orange,
    gap: 6,
  },
  actionTitle: {
    ...TypeScale.labelSmall,
    color: BrandColors.orange,
    textTransform: 'uppercase',
  },
  actionBody: { ...TypeScale.body, color: BrandColors.textHeading },
  actionStrong: { fontFamily: TypeScale.h4.fontFamily },
  actionWarning: { ...TypeScale.bodySmall, color: BrandColors.error },
  actionDone: { ...TypeScale.bodyBold, color: BrandColors.success },
  actionCancelled: { ...TypeScale.bodySmall, color: BrandColors.textMuted },
  actionButtons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  confirmBtn: {
    flex: 1,
    height: 40,
    borderRadius: Radii.pill,
    backgroundColor: BrandColors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: { ...TypeScale.bodyBold, color: BrandColors.white },
  cancelBtn: {
    flex: 1,
    height: 40,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: BrandColors.border,
    backgroundColor: BrandColors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { ...TypeScale.body, color: BrandColors.textBody },
  btnDisabled: { opacity: 0.7 },
  quickRow: { paddingHorizontal: 12, paddingBottom: 6 },
  quickPills: { flexDirection: 'row', gap: 8 },
  voiceError: {
    ...TypeScale.bodySmall,
    color: BrandColors.error,
    marginHorizontal: 20,
    marginBottom: 4,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 14,
    marginTop: 2,
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
