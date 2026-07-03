import { StyleSheet, Text, View } from 'react-native';

import { BrandColors, Radii, TypeScale } from '@/constants/brand';

export type BadgeTone = 'success' | 'warm' | 'info' | 'error' | 'neutral';

const TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  success: { bg: '#E9F9F0', fg: '#1B9E5A' }, // "Ready", "Active"
  warm: { bg: BrandColors.cream200, fg: BrandColors.orangeDark }, // "Qualified", "Reserved"
  info: { bg: '#EAEEF9', fg: BrandColors.navy }, // "New", "For Viewing"
  error: { bg: '#FDECEA', fg: BrandColors.error },
  neutral: { bg: BrandColors.border, fg: BrandColors.textSecondary },
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
