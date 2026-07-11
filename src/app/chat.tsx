import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
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

import { TagPill } from '@/components/ui/tag-pill';
import {
  ChatMessage,
  PendingAction,
  QUICK_ACTIONS,
  QuickAction,
  executePendingAction,
  sendToBayMo,
} from '@/lib/baymo-chat';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

const baymoAvatar = require('../../assets/brand/baymo.png');

/**
 * Chat message plus an optional action card. BayMo proposes actions (e.g.
 * enroll a lead in a campaign) but never executes them — the card's Confirm
 * button calls the model-free execute endpoint.
 */
type UiMessage = ChatMessage & {
  pending?: PendingAction;
  pendingState?: 'open' | 'working' | 'confirmed' | 'cancelled';
};

const GREETING: UiMessage = {
  role: 'assistant',
  content: "Kumusta! 👋 I'm BayMo. Ask me about your leads, or tap a shortcut below to get started.",
};

export default function ChatScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<UiMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const scrollToEnd = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

  const send = useCallback(
    async (text: string, task: QuickAction['task'] = 'chat', documentType?: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const userMsg: UiMessage = { role: 'user', content: trimmed };
      // Server history is text-only: strip the greeting and any card metadata.
      const history: ChatMessage[] = messages
        .filter((m) => m !== GREETING)
        .map((m) => ({ role: m.role, content: m.content }));
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setSending(true);
      scrollToEnd();

      const { reply, pendingAction, error } = await sendToBayMo(
        [...history, { role: 'user', content: trimmed }],
        task,
        documentType,
      );
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: error ? `Sorry, may problema — ${error}. Pakisubukan ulit.` : reply || '…',
          ...(pendingAction && !error ? { pending: pendingAction, pendingState: 'open' as const } : {}),
        },
      ]);
      setSending(false);
      scrollToEnd();
    },
    [messages, sending],
  );

  /**
   * Confirm on an action card → model-free execute call, then show the result.
   * Cards are addressed by index — the messages array is append-only, so the
   * index is stable across the async gap.
   */
  const confirmAction = useCallback(async (index: number, pending: PendingAction) => {
    const setCardState = (state: UiMessage['pendingState']) =>
      setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, pendingState: state } : m)));
    setCardState('working');
    const { ok, message } = await executePendingAction(pending);
    setMessages((prev) =>
      prev
        .map((m, i) =>
          i === index ? { ...m, pendingState: ok ? ('confirmed' as const) : ('open' as const) } : m,
        )
        .concat({
          role: 'assistant',
          content: ok ? message : `Hindi natuloy — ${message}`,
        }),
    );
    scrollToEnd();
  }, []);

  const cancelAction = useCallback((index: number) => {
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, pendingState: 'cancelled' as const } : m)),
    );
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={BrandColors.navy} />
        </Pressable>
        <Image source={baymoAvatar} style={styles.headerAvatar} contentFit="cover" />
        <View style={styles.flex}>
          <Text style={styles.headerTitle}>BayMo</Text>
          <Text style={styles.headerSub}>Your AI assistant</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.messages}>
          {messages.map((m, i) => (
            <View
              key={i}
              style={[styles.row, m.role === 'user' ? styles.rowUser : styles.rowAssistant]}>
              {m.role === 'assistant' && (
                <Image source={baymoAvatar} style={styles.bubbleAvatar} contentFit="cover" />
              )}
              <View style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.botBubble]}>
                <Text style={m.role === 'user' ? styles.userText : styles.botText}>{m.content}</Text>
                {m.pending && (
                  <View style={styles.actionCard}>
                    <Text style={styles.actionTitle}>Enroll in campaign</Text>
                    <Text style={styles.actionBody}>
                      <Text style={styles.actionStrong}>{m.pending.lead_name}</Text>
                      {' → '}
                      <Text style={styles.actionStrong}>{m.pending.campaign_name}</Text>
                    </Text>
                    {!!m.pending.warning && (
                      <Text style={styles.actionWarning}>⚠️ {m.pending.warning}</Text>
                    )}
                    {m.pendingState === 'confirmed' ? (
                      <Text style={styles.actionDone}>✅ Enrolled</Text>
                    ) : m.pendingState === 'cancelled' ? (
                      <Text style={styles.actionCancelled}>Cancelled</Text>
                    ) : (
                      <View style={styles.actionButtons}>
                        <Pressable
                          onPress={() => confirmAction(i, m.pending!)}
                          disabled={m.pendingState === 'working'}
                          style={[
                            styles.confirmBtn,
                            m.pendingState === 'working' && styles.btnDisabled,
                          ]}>
                          {m.pendingState === 'working' ? (
                            <ActivityIndicator color={BrandColors.white} size="small" />
                          ) : (
                            <Text style={styles.confirmBtnText}>Confirm</Text>
                          )}
                        </Pressable>
                        <Pressable
                          onPress={() => cancelAction(i)}
                          disabled={m.pendingState === 'working'}
                          style={styles.cancelBtn}>
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
              <Image source={baymoAvatar} style={styles.bubbleAvatar} contentFit="cover" />
              <View style={[styles.bubble, styles.botBubble]}>
                <ActivityIndicator color={BrandColors.navy} />
              </View>
            </View>
          )}
        </ScrollView>

        <View style={styles.quickRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.quickPills}>
              {QUICK_ACTIONS.map((qa) => (
                <TagPill
                  key={qa.label}
                  label={qa.label}
                  onPress={() => send(qa.prompt, qa.task, qa.documentType)}
                />
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
            <Ionicons name="arrow-up" size={20} color={BrandColors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BrandColors.screenBg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: BrandColors.white,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.border,
  },
  back: { padding: 2 },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: Radii.pill,
    borderWidth: 1.5,
    borderColor: BrandColors.orange,
  },
  headerTitle: { ...TypeScale.h4, color: BrandColors.textHeading },
  headerSub: { ...TypeScale.bodySmall, color: BrandColors.success },
  messages: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '100%' },
  rowUser: { justifyContent: 'flex-end' },
  rowAssistant: { justifyContent: 'flex-start' },
  bubbleAvatar: { width: 28, height: 28, borderRadius: Radii.pill },
  bubble: { maxWidth: '78%', borderRadius: Radii.card, padding: 12 },
  userBubble: { backgroundColor: BrandColors.navy, borderBottomRightRadius: 4 },
  botBubble: {
    backgroundColor: BrandColors.white,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: BrandColors.border,
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
  actionTitle: { ...TypeScale.labelSmall, color: BrandColors.orange, textTransform: 'uppercase' },
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
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    backgroundColor: BrandColors.white,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    backgroundColor: BrandColors.screenBg,
    borderRadius: Radii.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...TypeScale.body,
    color: BrandColors.textHeading,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: Radii.pill,
    backgroundColor: BrandColors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: BrandColors.disabled },
});
