import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import { Automation, fetchMyAutomations } from '@/lib/automations';

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
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchMyAutomations().then((a) => {
        setAutomations(a);
        setLoading(false);
      });
    }, []),
  );

  // Phase 2a: one General automation per client. Property/project slots come later.
  const canCreate = !loading && automations.length === 0;

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
                <Text style={styles.cardTitle}>{a.name}</Text>
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

      {canCreate ? null : !loading && (
        <Text style={styles.footnote}>
          Want BayMo focused on a specific listing or project? That’s coming soon — message the
          BaMo team in the meantime.
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
  cardBody: { ...TypeScale.bodySmall, color: BrandColors.textSecondary },
  statusPill: {
    borderWidth: 1,
    borderRadius: Radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: { ...TypeScale.labelSmall },
  footnote: {
    ...TypeScale.bodySmall,
    color: BrandColors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
  },
});
