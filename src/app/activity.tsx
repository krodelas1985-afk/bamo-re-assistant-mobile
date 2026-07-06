import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { AssignmentEvent, fetchAssignmentFeed } from '@/lib/activity';
import { relativeTime } from '@/lib/leads';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

function copyFor(ev: AssignmentEvent): { icon: keyof typeof Ionicons.glyphMap; tint: string; title: string; body: string } {
  const name = ev.leadName ?? 'A lead';
  if (ev.direction === 'assigned_to_me') {
    return {
      icon: 'person-add-outline',
      tint: BrandColors.success,
      title: `${name} assigned to you`,
      body: ev.method === 'manual' ? 'Assigned by your admin.' : 'Automatically routed to you.',
    };
  }
  return {
    icon: 'swap-horizontal-outline',
    tint: BrandColors.textMuted,
    title: `${name} was reassigned`,
    body: 'This lead is now handled by another agent and has left your list.',
  };
}

export default function ActivityScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<AssignmentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: e } = await fetchAssignmentFeed();
    if (e) setError(e);
    else setEvents(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen title="Activity" onBack={() => router.back()}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.navy} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Couldn&apos;t load your activity.</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <Button label="Try again" small onPress={load} style={{ marginTop: 4 }} />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="notifications-outline" size={30} color={BrandColors.navy} />
          </View>
          <Text style={styles.emptyText}>
            No lead assignment activity yet. When a lead is assigned to you — or handed to another
            agent — it will show up here.
          </Text>
        </View>
      ) : (
        events.map((ev) => {
          const c = copyFor(ev);
          return (
            <View key={ev.id} style={styles.row}>
              <View style={[styles.iconCircle, { backgroundColor: BrandColors.cream100 }]}>
                <Ionicons name={c.icon} size={20} color={c.tint} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{c.title}</Text>
                <Text style={styles.rowSubtitle}>{c.body}</Text>
                <Text style={styles.rowTime}>{relativeTime(ev.createdAt)}</Text>
              </View>
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: BrandColors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...TypeScale.body,
    color: BrandColors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  errorDetail: {
    ...TypeScale.bodySmall,
    color: BrandColors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  row: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...TypeScale.h4, color: BrandColors.textHeading },
  rowSubtitle: { ...TypeScale.bodySmall, color: BrandColors.textBody },
  rowTime: { ...TypeScale.bodySmall, color: BrandColors.textMuted, marginTop: 2 },
});
