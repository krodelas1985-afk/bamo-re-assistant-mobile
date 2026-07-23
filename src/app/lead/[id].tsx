import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BrandColors, CardShadow, Radii, TypeScale } from '@/constants/brand';
import {
  messengerInboxUrl,
  openCall,
  openEmail,
  openMessengerThread,
  openSms,
} from '@/lib/contact';
import {
  ConversationMessage,
  LeadDetail,
  fetchConversation,
  fetchLeadDetail,
  fetchMyFbPageId,
  takeoverLead,
} from '@/lib/leads';

const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;

function budgetLabel(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return min === max ? peso(min) : `${peso(min)} – ${peso(max)}`;
  if (max != null) return `Up to ${peso(max)}`;
  if (min != null) return `From ${peso(min)}`;
  return null;
}

function dateLabel(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value; // freeform text — show as-is
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Label/value rows for the Details card — only fields that are actually filled in. */
function detailRows(lead: LeadDetail): { label: string; value: string }[] {
  const q = lead.qualification;
  const rows: { label: string; value: string | null }[] = [
    { label: 'Phone', value: lead.phone },
    { label: 'Email', value: lead.email },
    { label: 'Location', value: lead.currentLocation },
    { label: 'Budget', value: q ? budgetLabel(q.budgetMin, q.budgetMax) : null },
    {
      label: 'Property',
      value: q ? [q.propertyType, q.propertySubType].filter(Boolean).join(' · ') || null : null,
    },
    { label: 'Unit preferred', value: q?.unitPreferred ?? null },
    { label: 'Bedrooms', value: q?.bedrooms != null ? `${q.bedrooms} BR` : null },
    { label: 'Preferred location', value: q?.preferredLocation?.filter(Boolean).join(', ') || null },
    { label: 'Payment scheme', value: q?.paymentScheme ?? null },
    { label: 'Financing', value: q?.preferredFinancing ?? null },
    { label: 'Move-in', value: dateLabel(q?.moveInDate ?? null) },
    { label: 'Purpose', value: q?.purpose ?? null },
    { label: 'Timeframe', value: lead.timeframe },
    { label: 'Motivation', value: lead.motivation },
  ];
  return rows.filter((r): r is { label: string; value: string } => !!r.value);
}

function MessageBubble({ msg }: { msg: ConversationMessage }) {
  const fromLead = msg.from === 'lead';
  const isBaymo = msg.from === 'baymo';
  const text = msg.text || `📎 ${msg.attachmentType}`;
  return (
    <View style={[styles.bubbleRow, !fromLead && styles.bubbleRowRight]}>
      <View
        style={[
          styles.bubble,
          fromLead ? styles.bubbleLead : isBaymo ? styles.bubbleBaymo : styles.bubbleAgent,
        ]}>
        {!fromLead ? (
          <Text style={[styles.bubbleSender, !isBaymo && styles.bubbleSenderOnNavy]}>
            {isBaymo ? 'BaMo 🤖' : 'Agent'}
          </Text>
        ) : null}
        <Text style={[styles.bubbleText, !fromLead && !isBaymo && styles.bubbleTextOnNavy]}>
          {text}
        </Text>
        <Text style={[styles.bubbleTime, !fromLead && !isBaymo && styles.bubbleTimeOnNavy]}>
          {msg.time}
        </Text>
      </View>
    </View>
  );
}

/** Round icon button for the contact action bar (call / SMS / Messenger / email). */
function ContactAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.contactAction} hitSlop={4}>
      {({ pressed }) => (
        <>
          <View style={[styles.contactIcon, pressed && { backgroundColor: BrandColors.orangeDark }]}>
            <Ionicons name={icon} size={20} color={BrandColors.white} />
          </View>
          <Text style={styles.contactLabel}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export default function LeadProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fbPageId, setFbPageId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    const [detail, convo] = await Promise.all([fetchLeadDetail(id), fetchConversation(id)]);
    if (detail.error) setError(detail.error);
    else setLead(detail.data);
    // Conversation errors are non-fatal — the profile still renders.
    setMessages(convo.data);
    setLoading(false);
  }, [id]);

  // Load on focus (like the Leads tab) so the profile refreshes when returning.
  useFocusEffect(
    useCallback(() => {
      load();
      fetchMyFbPageId().then(setFbPageId);
    }, [load]),
  );

  const doTakeover = useCallback(async () => {
    if (!lead) return;
    const { error: e, reassigned } = await takeoverLead(lead.id);
    if (reassigned) {
      Alert.alert(
        'Lead reassigned',
        `${lead.name} is no longer assigned to you — it was handed to another agent.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
      return;
    }
    if (e) {
      Alert.alert('Could not update', e);
      return;
    }
    // Stay on the profile — the agent takes over to message the lead next.
    setLead((prev) => (prev ? { ...prev, automationEnabled: false } : prev));
  }, [lead, router]);

  const onTakeover = useCallback(() => {
    if (!lead) return;
    Alert.alert(
      `Take over ${lead.name}?`,
      'BaMo automation will stop for this lead — no more auto-replies or follow-up sequences. ' +
        'The lead switches to manual mode and you handle the conversation from here.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take over', onPress: doTakeover },
      ],
    );
  }, [lead, doTakeover]);

  const canMessenger = !!messengerInboxUrl(fbPageId, lead?.messengerId ?? null);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={BrandColors.textHeading} />
        </Pressable>
        <Text style={styles.headerTitle}>Lead Profile</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.navy} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Couldn&apos;t load this lead.</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <Button label="Try again" small onPress={load} />
        </View>
      ) : !lead ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            This lead isn&apos;t in your list anymore — it may have been handed to another agent.
          </Text>
          <Button label="Back to leads" small onPress={() => router.back()} />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            {/* Profile header */}
            <View style={styles.card}>
              <View style={styles.profileRow}>
                <Avatar name={lead.name} size={56} />
                <View style={styles.nameBlock}>
                  <Text style={styles.name}>{lead.name}</Text>
                  <Text style={styles.meta}>
                    {lead.timestamp ? `${lead.timestamp} · ` : ''}via {lead.source}
                  </Text>
                </View>
                <Badge label={lead.status} tone={lead.statusTone} />
              </View>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryText}>{lead.summary}</Text>
              </View>
              {lead.automationEnabled ? (
                <>
                  <Button label="Takeover" small onPress={onTakeover} />
                  <Text style={styles.takeoverNote}>
                    Stops BaMo automation for this lead and switches it to manual mode — you
                    handle the replies from here.
                  </Text>
                </>
              ) : (
                <View style={styles.manualBox}>
                  <Ionicons name="hand-left-outline" size={16} color={BrandColors.orangeDark} />
                  <Text style={styles.manualText}>
                    Manual mode — BaMo automation is off. This lead is all yours.
                  </Text>
                </View>
              )}
            </View>

            {/* Details */}
            {detailRows(lead).length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Details</Text>
                {detailRows(lead).map((row) => (
                  <View key={row.label} style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{row.label}</Text>
                    <Text style={styles.detailValue}>{row.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Conversation */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Conversation</Text>
              {messages.length === 0 ? (
                <Text style={styles.emptyConvo}>
                  No messages on file yet for this lead.
                </Text>
              ) : (
                <View style={styles.convo}>
                  {messages.map((m) => (
                    <MessageBubble key={m.id} msg={m} />
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Contact action bar — only channels this lead actually has. */}
          {(lead.phone || canMessenger || lead.email) ? (
            <View style={styles.actionBar}>
              {lead.phone ? (
                <ContactAction icon="call-outline" label="Call" onPress={() => openCall(lead.phone!)} />
              ) : null}
              {lead.phone ? (
                <ContactAction
                  icon="chatbubble-ellipses-outline"
                  label="SMS"
                  onPress={() => openSms(lead.phone!)}
                />
              ) : null}
              {canMessenger ? (
                <ContactAction
                  icon="logo-facebook"
                  label="Messenger"
                  onPress={() => openMessengerThread(fbPageId, lead.messengerId)}
                />
              ) : null}
              {lead.email ? (
                <ContactAction icon="mail-outline" label="Email" onPress={() => openEmail(lead.email!)} />
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BrandColors.screenBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: {
    marginLeft: -6,
  },
  headerTitle: {
    ...TypeScale.h3,
    color: BrandColors.textHeading,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  emptyText: {
    ...TypeScale.body,
    color: BrandColors.textSecondary,
    textAlign: 'center',
  },
  errorDetail: {
    ...TypeScale.bodySmall,
    color: BrandColors.textMuted,
    textAlign: 'center',
  },
  card: {
    backgroundColor: BrandColors.white,
    ...CardShadow,
    borderRadius: Radii.card,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    ...TypeScale.h4,
    color: BrandColors.textHeading,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nameBlock: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...TypeScale.h3,
    color: BrandColors.textHeading,
  },
  meta: {
    ...TypeScale.bodySmall,
    color: BrandColors.textMuted,
  },
  summaryBox: {
    backgroundColor: BrandColors.screenBg,
    borderRadius: Radii.button,
    padding: 12,
  },
  summaryText: {
    ...TypeScale.body,
    color: BrandColors.textBody,
  },
  takeoverNote: {
    ...TypeScale.helper,
    color: BrandColors.textMuted,
    textAlign: 'center',
  },
  manualBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BrandColors.cream200,
    borderRadius: Radii.button,
    padding: 12,
  },
  manualText: {
    ...TypeScale.bodySmall,
    color: BrandColors.textSecondary,
    flex: 1,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailLabel: {
    ...TypeScale.label,
    color: BrandColors.textMuted,
  },
  detailValue: {
    ...TypeScale.body,
    color: BrandColors.textHeading,
    flex: 1,
    textAlign: 'right',
  },
  convo: {
    gap: 8,
  },
  emptyConvo: {
    ...TypeScale.body,
    color: BrandColors.textMuted,
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  bubbleRowRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: Radii.button,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 2,
  },
  bubbleLead: {
    backgroundColor: BrandColors.screenBg,
    borderTopLeftRadius: 4,
  },
  bubbleBaymo: {
    backgroundColor: BrandColors.cream200,
    borderTopRightRadius: 4,
  },
  bubbleAgent: {
    backgroundColor: BrandColors.navy,
    borderTopRightRadius: 4,
  },
  bubbleSender: {
    ...TypeScale.labelSmall,
    color: BrandColors.orangeDark,
  },
  bubbleSenderOnNavy: {
    color: BrandColors.orangeSoft,
  },
  bubbleText: {
    ...TypeScale.body,
    color: BrandColors.textHeading,
  },
  bubbleTextOnNavy: {
    color: BrandColors.white,
  },
  bubbleTime: {
    ...TypeScale.labelSmall,
    color: BrandColors.textMuted,
    alignSelf: 'flex-end',
  },
  bubbleTimeOnNavy: {
    color: BrandColors.borderDark,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    backgroundColor: BrandColors.white,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  contactAction: {
    alignItems: 'center',
    gap: 4,
    minWidth: 64,
  },
  contactIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BrandColors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactLabel: {
    ...TypeScale.labelSmall,
    color: BrandColors.textSecondary,
  },
});
