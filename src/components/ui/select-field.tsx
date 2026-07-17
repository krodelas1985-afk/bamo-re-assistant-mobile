import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BrandColors, Radii, TypeScale } from '@/constants/brand';

/**
 * Searchable single-select picker: a field that reads like a text input and
 * opens a modal option list. Plain RN (Modal + FlatList) so it behaves the
 * same on Android, iOS, and web — same reasoning as date-time-picker.
 *
 * animationType must stay "none": with "fade", react-native-web (0.21) never
 * hides the modal when visible flips false, so it can't be dismissed on web.
 */
export function SelectField({
  label,
  value,
  options,
  placeholder,
  onSelect,
  disabled = false,
  disabledHint,
}: {
  label: string;
  value: string | null;
  options: string[];
  placeholder: string;
  onSelect: (option: string) => void;
  disabled?: boolean;
  /** Shown under the field when disabled (e.g. "Pick a province first"). */
  disabledHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const close = () => setOpen(false);

  const pick = (option: string) => {
    onSelect(option);
    setQuery('');
    close();
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={[styles.control, disabled && styles.controlDisabled]}
        onPress={() => !disabled && setOpen(true)}>
        <Text style={[styles.controlText, !value && styles.placeholder]}>
          {value ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={BrandColors.textMuted} />
      </Pressable>
      {disabled && disabledHint ? <Text style={styles.hint}>{disabledHint}</Text> : null}

      <Modal visible={open} transparent animationType="none" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={BrandColors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search…"
                placeholderTextColor={BrandColors.textMuted}
                autoCorrect={false}
              />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(item) => item}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.empty}>No matches</Text>}
              renderItem={({ item }) => (
                <Pressable style={styles.option} onPress={() => pick(item)}>
                  <Text style={[styles.optionText, item === value && styles.optionSelected]}>
                    {item}
                  </Text>
                  {item === value ? (
                    <Ionicons name="checkmark" size={18} color={BrandColors.orange} />
                  ) : null}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
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
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: BrandColors.borderDark,
    borderRadius: Radii.button,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: BrandColors.white,
  },
  controlDisabled: {
    opacity: 0.5,
  },
  controlText: {
    ...TypeScale.input,
    flex: 1,
    color: BrandColors.textHeading,
  },
  placeholder: {
    color: BrandColors.textMuted,
  },
  hint: {
    ...TypeScale.helper,
    color: BrandColors.textMuted,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 16,
    gap: 10,
    maxHeight: '75%',
  },
  sheetTitle: {
    ...TypeScale.h4,
    color: BrandColors.textHeading,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: BrandColors.borderDark,
    borderRadius: Radii.button,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    ...TypeScale.body,
    flex: 1,
    color: BrandColors.textHeading,
    padding: 0,
  },
  list: {
    flexGrow: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BrandColors.border,
  },
  optionText: {
    ...TypeScale.body,
    flex: 1,
    color: BrandColors.textHeading,
  },
  optionSelected: {
    ...TypeScale.bodyBold,
    color: BrandColors.navy,
  },
  empty: {
    ...TypeScale.bodySmall,
    color: BrandColors.textMuted,
    paddingVertical: 12,
    textAlign: 'center',
  },
});
