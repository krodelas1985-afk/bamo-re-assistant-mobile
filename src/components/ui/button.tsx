import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { BrandColors, Radii, TypeScale } from '@/constants/brand';

type Variant = 'primary' | 'secondary';

/** Brand button — primary = orange filled, secondary = white outlined with navy text. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  small = false,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  small?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        variant === 'primary'
          ? { backgroundColor: pressed ? BrandColors.orangeDark : BrandColors.orange }
          : [styles.secondary, pressed && { backgroundColor: BrandColors.cream50 }],
        style,
      ]}>
      <Text
        style={[
          small ? styles.textSmall : styles.text,
          { color: variant === 'primary' ? BrandColors.white : BrandColors.navy },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radii.button,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  secondary: {
    backgroundColor: BrandColors.white,
    borderWidth: 1,
    borderColor: BrandColors.borderDark,
  },
  text: {
    ...TypeScale.button,
  },
  textSmall: {
    ...TypeScale.bodyBold,
  },
});
