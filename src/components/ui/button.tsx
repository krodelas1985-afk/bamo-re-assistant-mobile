import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';

import { BrandColors, Radii, TypeScale } from '@/constants/brand';

type Variant = 'primary' | 'secondary';

/** One clear primary action, with a quieter outlined alternative. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  small = false,
  style,
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        variant === 'primary'
          ? [styles.primary, pressed && { backgroundColor: BrandColors.navyDark }]
          : [styles.secondary, pressed && { backgroundColor: BrandColors.cream100 }],
        style,
        (disabled || loading) && { opacity: 0.55 },
      ]}>
      {loading && <ActivityIndicator color={variant === 'primary' ? BrandColors.white : BrandColors.navy} />}
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
    minHeight: 52,
    flexDirection: 'row',
    gap: 8,
    borderRadius: Radii.button,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: BrandColors.navy,
  },
  small: {
    minHeight: 44,
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
    flexShrink: 1,
    textAlign: 'center',
  },
  textSmall: {
    ...TypeScale.bodyBold,
    flexShrink: 1,
    textAlign: 'center',
  },
});
