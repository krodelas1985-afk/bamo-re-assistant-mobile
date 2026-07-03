import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import { LeadStats, fetchLeadStats } from '@/lib/leads';

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Magandang umaga,';
  if (hour < 18) return 'Magandang hapon,';
  return 'Magandang gabi,';
}

const DASH = '—';

export default function HomeScreen() {
  const { profile, session } = useAuth();
  const [stats, setStats] = useState<LeadStats | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchLeadStats().then((s) => {
        if (active) setStats(s);
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

  return (
    <Screen>
      <View style={styles.greetingCard}>
        <Text style={styles.greetingSmall}>{greetingForNow()}</Text>
        <Text style={styles.greetingName}>{displayName} 👋</Text>
        <Text style={styles.greetingBody}>
          BaMo is handling the follow-ups. Here&apos;s what needs your attention.
        </Text>
      </View>

      <View style={styles.statsGrid}>
        {cards.map((s) => (
          <View key={s.label} style={styles.statCard}>
            <Text style={styles.statLabel}>{s.label}</Text>
            <Text style={styles.statValue}>{s.value}</Text>
          </View>
        ))}
      </View>
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
});
