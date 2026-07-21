import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import {
  Automation,
  FollowupRequest,
  MAX_AUTOMATIONS,
  fetchLatestFollowupRequest,
  fetchMyAutomations,
} from '@/lib/automations';
import { fetchMyFbPageId } from '@/lib/leads';

const STATUS_META: Record<
  Automation['status'],
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  draft: { label: 'Draft', color: BrandColors.textMuted, icon: 'create-outline' },
  pending_review: { label: 'In review', color: BrandColors.orange, icon: 'time-outline' },
  active: { label: 'Live', color: BrandColors.success, icon: 'flash' },
  paused: { label: 'Paused', color: BrandColors.textMuted, icon: 'pause-circle-outline' },
  completed: { label: 'Finished', color: BrandColors.textMuted, icon: 'checkmark-done-outline' },
};

export default function AutomationsScreen() {
  const router = useRouter();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [followup, setFollowup] = useState<FollowupRequest | null>(null);
  const [fbPageId, setFbPageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      Promise.all([fetchMyAutomations(), fetchLatestFollowupRequest(), fetchMyFbPageId()]).then(
        ([a, f, p]) => {
          setAutomations(a);
          setFollowup(f);
          setFbPageId(p);
          setLoading(false);
        },
      );
    }, []),
  );

  // 3-slot model: 1 General + up to 2 Property/Project automations.
  const openAutomations = automations.filter((a) => a.status !== 'completed');
  const canCreate = !loading && openAutomations.length < MAX_AUTOMATIONS;

  return (
    <Screen title="BayMo Automations">
      <Text style={styles.tagline}>Let BayMo talk to your Leads</Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.navy} />
        </View>
      ) : automations.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="sparkles-outline" size={40} color={BrandColors.orange} />
          <Text style={styles.emptyTitle}>Teach BayMo to answer for you</Text>
          <Text style={styles.emptyBody}>
            In a few minutes, set up how BayMo greets, qualifies, and follows up with everyone who
            messages your Page — day and night. The BaMo team reviews every setup before it goes
            live.
          </Text>
          <Button label="Set up BayMo" onPress={() => router.push('/automation-new')} />
        </View>
      ) : (
        automations.map((a) => {
          const meta = STATUS_META[a.status];
          return (
            <View key={a.id} style={styles.card}>
              <View style={[styles.iconWrap, { backgroundColor: `${meta.color}18` }]}>
                <Ionicons name={meta.icon} size={22} color={meta.color} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>
                  {a.name}
                  {a.scope !== 'general' && (
                    <Text style={styles.scopeTag}>
                      {'  '}
                      {a.scope === 'project' ? 'Project' : 'Listing'}
                    </Text>
                  )}
                </Text>
                <Text style={styles.cardBody}>
                  {a.status === 'pending_review'
                    ? 'The BaMo team is reviewing your setup — we’ll notify you when it’s live.'
                    : a.status === 'active'
                      ? 'BayMo is answering your leads.'
                      : meta.label}
                </Text>
              </View>
              <View style={[styles.statusPill, { borderColor: meta.color }]}>
                <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
              </View>
            </View>
          );
        })
      )}

      {automations
        .filter((a) => a.status === 'pending_review' || a.status === 'active')
        .slice(0, 1)
        .map((a) => (
          <Pressable
            key={`test-${a.id}`}
            style={styles.testCard}
            onPress={() =>
              router.push({
                pathname: '/automation-test',
                params: { campaignId: a.id, name: a.name },
              })
            }>
            <Ionicons name="chatbubbles-outline" size={22} color={BrandColors.white} />
            <View style={styles.cardText}>
              <Text style={styles.testTitle}>Test your BaMo</Text>
              <Text style={styles.testBody}>
                Chat with BayMo as if you were a lead — see exactly how it will answer.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BrandColors.white} />
          </Pressable>
        ))}

      {fbPageId != null && automations.some((a) => a.status === 'active') && (
        <Pressable
          style={styles.card}
          onPress={() => Linking.openURL(`https://m.me/${fbPageId}`)}>
          <View style={[styles.iconWrap, { backgroundColor: `${BrandColors.success}18` }]}>
            <Ionicons name="logo-facebook" size={22} color={BrandColors.success} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>See BayMo live</Text>
            <Text style={styles.cardBody}>
              Message your own Page on Messenger — BayMo will answer you like a real lead.
            </Text>
          </View>
          <Ionicons name="open-outline" size={18} color={BrandColors.textMuted} />
        </Pressable>
      )}

      {!loading && (
        <Pressable style={styles.card} onPress={() => router.push('/followup-setup')}>
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor:
                  followup?.status === 'active'
                    ? `${BrandColors.success}18`
                    : `${BrandColors.orange}18`,
              },
            ]}>
            <Ionicons
              name="repeat-outline"
              size={22}
              color={followup?.status === 'active' ? BrandColors.success : BrandColors.orange}
            />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Auto Follow-Up</Text>
            <Text style={styles.cardBody}>
              {followup == null || followup.status === 'rejected'
                ? 'Let BayMo follow up with leads who go quiet.'
                : followup.status === 'active'
                  ? 'On — BayMo follows up with quiet leads for you.'
                  : 'Being set up by the BaMo team.'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={BrandColors.textMuted} />
        </Pressable>
      )}

      {!loading && automations.length > 0 && canCreate && (
        <Button
          label="Add automation for a listing or project"
          onPress={() => router.push('/automation-new')}
        />
      )}
      {!loading && !canCreate && (
        <Text style={styles.footnote}>
          You’ve used all {MAX_AUTOMATIONS} automation slots. Message the BaMo team if you need
          more.
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tagline: { ...TypeScale.body, color: BrandColors.textSecondary, marginTop: -6 },
  center: { paddingVertical: 48, alignItems: 'center' },
  emptyWrap: { alignItems: 'center', gap: 10, paddingVertical: 32, paddingHorizontal: 12 },
  emptyTitle: { ...TypeScale.h3, color: BrandColors.textHeading, textAlign: 'center' },
  emptyBody: {
    ...TypeScale.body,
    color: BrandColors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BrandColors.white,
    borderWidth: 1,
    borderColor: BrandColors.border,
    borderRadius: Radii.card,
    padding: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { ...TypeScale.bodyBold, color: BrandColors.textHeading },
  scopeTag: { ...TypeScale.labelSmall, color: BrandColors.orange },
  cardBody: { ...TypeScale.bodySmall, color: BrandColors.textSecondary },
  statusPill: {
    borderWidth: 1,
    borderRadius: Radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: { ...TypeScale.labelSmall },
  testCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BrandColors.navy,
    borderRadius: Radii.card,
    padding: 14,
  },
  testTitle: { ...TypeScale.bodyBold, color: BrandColors.white },
  testBody: { ...TypeScale.bodySmall, color: BrandColors.cream100 },
  footnote: {
    ...TypeScale.bodySmall,
    color: BrandColors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
  },
});
