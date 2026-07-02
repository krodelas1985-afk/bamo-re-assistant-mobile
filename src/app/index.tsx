import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

// Placeholder data — replaced by live Supabase queries in Phase 2.
const STATS = [
  { label: 'New leads (7d)', value: '—', hint: '' },
  { label: 'Hot leads', value: '—', hint: '' },
  { label: 'Viewings this week', value: '—', hint: '' },
  { label: 'Active listings', value: '—', hint: '' },
];

export default function HomeScreen() {
  return (
    <Screen>
      <View style={styles.greetingCard}>
        <Text style={styles.greetingSmall}>Magandang umaga,</Text>
        <Text style={styles.greetingName}>Agent 👋</Text>
        <Text style={styles.greetingBody}>
          BaMo is setting things up. Your overnight summary will appear here.
        </Text>
      </View>

      <View style={styles.statsGrid}>
        {STATS.map((s) => (
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
