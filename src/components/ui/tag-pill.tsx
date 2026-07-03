import { Pressable, StyleSheet, Text } from 'react-native';

import { BrandColors, Radii, TypeScale } from '@/constants/brand';

/**
 * Filter / tag pill. Two uses:
 * - selectable filter row (active = white bg + shadow, inactive = transparent muted)
 * - static financing tags on listing cards (cream bg)
 */
export function TagPill({
  label,
  active = false,
  cream = false,
  onPress,
}: {
  label: string;
  active?: boolean;
  cream?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.pill, cream ? styles.cream : active ? styles.active : styles.inactive]}>
      <Text
        style={[
          styles.text,
          { color: cream ? BrandColors.orangeDark : active ? BrandColors.textHeading : BrandColors.textMuted },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: Radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  active: {
    backgroundColor: BrandColors.white,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inactive: {
    backgroundColor: 'transparent',
  },
  cream: {
    backgroundColor: BrandColors.cream200,
    paddingVertical: 4,
  },
  text: {
    ...TypeScale.label,
  },
});
