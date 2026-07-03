import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { BrandColors, Radii, TypeScale } from '@/constants/brand';

/** Labeled text input matching the brand form spec. */
export function TextField({
  label,
  error,
  ...inputProps
}: { label: string; error?: string | null } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        placeholderTextColor={BrandColors.textMuted}
        {...inputProps}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 6,
  },
  label: {
    ...TypeScale.label,
    color: BrandColors.textSecondary,
  },
  input: {
    ...TypeScale.input,
    borderWidth: 1,
    borderColor: BrandColors.borderDark,
    borderRadius: Radii.button,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: BrandColors.textHeading,
    backgroundColor: BrandColors.white,
  },
  inputError: {
    borderColor: BrandColors.error,
  },
  error: {
    ...TypeScale.formError,
    color: BrandColors.error,
  },
});
