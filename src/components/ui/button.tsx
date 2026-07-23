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
          ? [styles.primary, pressed && { backgroundColor: BrandColors.coralDark }]
          : [styles.secondary, pressed && { backgroundColor: BrandColors.cream100 }],
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
  primary: {
    backgroundColor: BrandColors.coral,
    shadowColor: BrandColors.coral,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  small: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  secondary: {
    backgroundColor: BrandColors.white,
    borderWidth: 1,
    borderColor: BrandColors.border,
  },
  text: {
    ...TypeScale.button,
  },
  textSmall: {
    ...TypeScale.bodyBold,
  },
});
