import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
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

import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import { supabase } from '@/lib/supabase';

type Msg = { role: 'user' | 'assistant'; content: string };

/**
 * "Test your BaMo" simulator: the client plays the lead. Replies come from the
 * test-baymo edge function, which mirrors W2's live prompt assembly (same
 * persona, KB, qualification flow) — nothing touches Messenger or real leads.
 */
export default function AutomationTestScreen() {
  const router = useRouter();
  const { campaignId, name } = useLocalSearchParams<{ campaignId: string; name?: string }>();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [askedFields, setAskedFields] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !campaignId) return;
    setInput('');
    setError(null);
    const history = messages;
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setSending(true);
    const { data, error: e } = await supabase.functions.invoke('test-baymo', {
      body: {
        campaign_id: campaignId,
        message: text,
        history,
        asked_fields: askedFields,
      },
    });
    setSending(false);
    if (e || data?.error) {
      setError(e?.message ?? data?.error ?? 'Something went wrong');
      return;
    }
    setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
    if (data.asked_field) {
      setAskedFields((f) => (f.includes(data.asked_field) ? f : [...f, data.asked_field]));
    }
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const reset = () => {
    setMessages([]);
    setAskedFields([]);
    setError(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={BrandColors.textHeading} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Test your BaMo</Text>
          {!!name && <Text style={styles.headerSub}>{name}</Text>}
        </View>
        <Pressable onPress={reset} hitSlop={12}>
          <Ionicons name="refresh" size={22} color={BrandColors.textMuted} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.chat}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          <View style={styles.intro}>
            <Ionicons name="chatbubbles-outline" size={28} color={BrandColors.orange} />
            <Text style={styles.introText}>
              Pretend you&apos;re a buyer messaging your Page. BayMo replies exactly the way it
              would to a real lead — same persona, questions, and knowledge. Nothing here is sent
              to Messenger.
            </Text>
          </View>

          {messages.map((m, i) => (
            <View
              key={i}
              style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAi]}>
              <Text style={m.role === 'user' ? styles.bubbleUserText : styles.bubbleAiText}>
                {m.content}
              </Text>
            </View>
          ))}

          {sending && (
            <View style={[styles.bubble, styles.bubbleAi]}>
              <ActivityIndicator size="small" color={BrandColors.navy} />
            </View>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Type as the lead… e.g. Magkano po ang 2BR?"
            placeholderTextColor={BrandColors.textMuted}
            onSubmitEditing={send}
            returnKeyType="send"
            editable={!sending}
          />
          <Pressable
            style={[styles.sendBtn, (!input.trim() || sending) && { opacity: 0.5 }]}
            onPress={send}
            disabled={!input.trim() || sending}>
            <Ionicons name="send" size={18} color={BrandColors.white} />
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: BrandColors.white,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.border,
  },
  headerTitle: { ...TypeScale.h4, color: BrandColors.textHeading },
  headerSub: { ...TypeScale.labelSmall, color: BrandColors.textMuted },
  chat: { padding: 16, gap: 8, paddingBottom: 24 },
  intro: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  introText: {
    ...TypeScale.bodySmall,
    color: BrandColors.textSecondary,
    textAlign: 'center',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: Radii.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: BrandColors.navy,
    borderBottomRightRadius: 4,
  },
  bubbleAi: {
    alignSelf: 'flex-start',
    backgroundColor: BrandColors.white,
    borderWidth: 1,
    borderColor: BrandColors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleUserText: { ...TypeScale.body, color: BrandColors.white },
  bubbleAiText: { ...TypeScale.body, color: BrandColors.textHeading },
  error: { ...TypeScale.bodySmall, color: BrandColors.error, textAlign: 'center' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: BrandColors.white,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
  },
  input: {
    ...TypeScale.body,
    flex: 1,
    color: BrandColors.textHeading,
    backgroundColor: BrandColors.screenBg,
    borderRadius: Radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BrandColors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
