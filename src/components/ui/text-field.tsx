import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

/** Consistent labels, focus states, and password visibility across all forms. */
export function TextField({ label, error, style, secureTextEntry, onFocus, onBlur, ...inputProps }:
  { label: string; error?: string | null } & TextInputProps) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput placeholderTextColor={BrandColors.textMuted} {...inputProps}
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
          secureTextEntry={secureTextEntry && !visible}
          onFocus={(event) => { setFocused(true); onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); onBlur?.(event); }}
          style={[styles.input, focused && styles.inputFocused, error ? styles.inputError : null, secureTextEntry && { paddingRight: 52 }, style]} />
        {secureTextEntry && (
          <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            onPress={() => setVisible((value) => !value)} style={styles.visibility}>
            <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={21} color={BrandColors.navy} />
          </Pressable>
        )}
      </View>
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { ...TypeScale.label, color: BrandColors.textSecondary },
  inputWrap: { position: 'relative' },
  visibility: { position: 'absolute', right: 4, top: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { ...TypeScale.input, minHeight: 52, borderWidth: 1, borderColor: BrandColors.borderDark,
    borderRadius: Radii.button, paddingHorizontal: 14, paddingVertical: 12,
    color: BrandColors.textHeading, backgroundColor: BrandColors.white },
  inputFocused: { borderColor: BrandColors.navy, backgroundColor: BrandColors.cream50 },
  inputError: { borderColor: BrandColors.error },
  error: { ...TypeScale.formError, color: BrandColors.error },
});
