import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

const ITEMS = [
  { icon: 'share-social-outline', title: 'Social Media', subtitle: 'Scheduled posts, creatives' },
  { icon: 'navigate-outline', title: 'Ads Management', subtitle: 'Analytics, run & manage ads' },
  { icon: 'document-text-outline', title: 'Documents', subtitle: 'Authority to Sell, MOA, CTS, LOI' },
  { icon: 'settings-outline', title: 'Settings', subtitle: 'Profile, accounts, notifications' },
] as const;

export default function MoreScreen() {
  return (
    <Screen title="More">
      {ITEMS.map((item) => (
        <View key={item.title} style={styles.row}>
          <View style={styles.iconCircle}>
            <Ionicons name={item.icon} size={20} color={BrandColors.navy} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={BrandColors.textMuted} />
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: BrandColors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...TypeScale.h4,
    color: BrandColors.textHeading,
  },
  rowSubtitle: {
    ...TypeScale.bodySmall,
    color: BrandColors.textBody,
  },
});
