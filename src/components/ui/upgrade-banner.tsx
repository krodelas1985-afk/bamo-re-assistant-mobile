import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { BrandColors, Radii, TypeScale } from '@/constants/brand';

/**
 * Warm cream notice shown when a free-plan resource is at (or near) its cap.
 * Purely informational — the create button next to it is what gets disabled.
 */
export function UpgradeBanner({ message }: { message: string }) {
  return (
    <View style={styles.banner}>
      <Ionicons name="sparkles" size={18} color={BrandColors.orangeDark} style={styles.icon} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: BrandColors.cream300,
    borderWidth: 1,
    borderColor: BrandColors.orangeSoft,
    borderRadius: Radii.card,
    padding: 12,
  },
  icon: {
    marginTop: 1,
  },
  text: {
    ...TypeScale.bodySmall,
    color: BrandColors.orangeDark,
    flex: 1,
  },
});
