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
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected: active } : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.pill, !!onPress && { minHeight: 44, justifyContent: 'center' }, cream ? styles.cream : active ? styles.active : styles.inactive]}>
      <Text
        style={[
          styles.text,
          { color: cream ? BrandColors.coralDark : active ? BrandColors.white : BrandColors.ink },
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
    backgroundColor: BrandColors.navy,
  },
  inactive: {
    backgroundColor: BrandColors.white,
    borderWidth: 1,
    borderColor: BrandColors.border,
  },
  cream: {
    backgroundColor: BrandColors.coralSoft,
    paddingVertical: 4,
  },
  text: {
    ...TypeScale.label,
  },
});
