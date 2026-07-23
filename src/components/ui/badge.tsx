import { StyleSheet, Text, View } from 'react-native';

import { BrandColors, Radii, TypeScale } from '@/constants/brand';

export type BadgeTone = 'success' | 'warm' | 'info' | 'error' | 'neutral';

const TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  success: { bg: BrandColors.successSoft, fg: BrandColors.successDeep }, // "Ready", "Active"
  warm: { bg: BrandColors.coralSoft, fg: BrandColors.coralDark }, // "Qualified", "Reserved"
  info: { bg: BrandColors.infoSoft, fg: BrandColors.infoDeep }, // "New", "For Viewing"
  error: { bg: BrandColors.errorSoft, fg: BrandColors.errorDeep },
  neutral: { bg: BrandColors.cream200, fg: BrandColors.textSecondary },
};

/** Small status pill — e.g. lead status, listing availability. */
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const colors = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: Radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  text: {
    ...TypeScale.labelSmall,
  },
});
