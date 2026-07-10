import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import {
  BUDGET_BUCKETS,
  BudgetBucketKey,
  EMPTY_LEAD_FILTERS,
  LEAD_TYPE_OPTIONS,
  LeadFilters,
  LeadSort,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  TEMPERATURE_OPTIONS,
} from '@/lib/leads';

/** Multi-select chip used inside the sheet (navy when selected). */
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active ? styles.chipActive : null]}>
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.chipRow}>{children}</View>
    </View>
  );
}

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/**
 * Bottom sheet for the Leads screen: sort + advanced filters. Edits a local
 * draft and only commits on "Show N leads", so dismissing keeps the old state.
 */
export function LeadFilterSheet({
  visible,
  onClose,
  filters,
  sort,
  sourceOptions,
  countFor,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  filters: LeadFilters;
  sort: LeadSort;
  /** Distinct sources present in this workspace's leads (dynamic, not hard-coded). */
  sourceOptions: string[];
  /** Live result count for a draft filter state (search + quick pill already applied). */
  countFor: (f: LeadFilters) => number;
  onApply: (filters: LeadFilters, sort: LeadSort) => void;
}) {
  const [draft, setDraft] = useState<LeadFilters>(filters);
  const [draftSort, setDraftSort] = useState<LeadSort>(sort);

  // Re-seed the draft from the applied state every time the sheet opens
  // (state-adjustment-during-render pattern, not an effect).
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setDraft(filters);
      setDraftSort(sort);
    }
  }

  const count = countFor(draft);
  const set = (patch: Partial<LeadFilters>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Filters & sort</Text>
            <Pressable
              onPress={() => {
                setDraft(EMPTY_LEAD_FILTERS);
                setDraftSort('recent');
              }}
              hitSlop={8}>
              <Text style={styles.reset}>Reset</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
              <Ionicons name="close" size={24} color={BrandColors.textHeading} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Section label="Sort by">
              {SORT_OPTIONS.map((s) => (
                <Chip
                  key={s.key}
                  label={s.label}
                  active={draftSort === s.key}
                  onPress={() => setDraftSort(s.key)}
                />
              ))}
            </Section>

            <Section label="Temperature">
              {TEMPERATURE_OPTIONS.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  active={draft.temperatures.includes(t)}
                  onPress={() => set({ temperatures: toggle(draft.temperatures, t) })}
                />
              ))}
            </Section>

            <Section label="Status">
              {STATUS_OPTIONS.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  active={draft.statuses.includes(s)}
                  onPress={() => set({ statuses: toggle(draft.statuses, s) })}
                />
              ))}
            </Section>

            {sourceOptions.length > 0 && (
              <Section label="Source">
                {sourceOptions.map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    active={draft.sources.includes(s)}
                    onPress={() => set({ sources: toggle(draft.sources, s) })}
                  />
                ))}
              </Section>
            )}

            <Section label="Type of lead">
              {LEAD_TYPE_OPTIONS.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  active={draft.leadTypes.includes(t)}
                  onPress={() => set({ leadTypes: toggle(draft.leadTypes, t) })}
                />
              ))}
            </Section>

            <Section label="Budget">
              {BUDGET_BUCKETS.map((b) => (
                <Chip
                  key={b.key}
                  label={b.label}
                  active={draft.budgets.includes(b.key)}
                  onPress={() =>
                    set({ budgets: toggle(draft.budgets, b.key) as BudgetBucketKey[] })
                  }
                />
              ))}
            </Section>

            <TextField
              label="Timeframe"
              value={draft.timeframe}
              onChangeText={(timeframe) => set({ timeframe })}
              placeholder="e.g. 3 months, ASAP, next year"
            />
            <TextField
              label="Current location"
              value={draft.currentLocation}
              onChangeText={(currentLocation) => set({ currentLocation })}
              placeholder="e.g. Lipa, Cavite, abroad"
            />
            <TextField
              label="Preferred location"
              value={draft.preferredLocation}
              onChangeText={(preferredLocation) => set({ preferredLocation })}
              placeholder="e.g. Batangas, Vermira"
            />
          </ScrollView>

          <View style={styles.footer}>
            <Button
              label={count === 1 ? 'Show 1 lead' : `Show ${count} leads`}
              onPress={() => {
                onApply(draft, draftSort);
                onClose();
              }}
              style={styles.applyBtn}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(19, 42, 92, 0.45)', justifyContent: 'flex-end' },
  backdropTouch: { flex: 1 },
  sheet: {
    backgroundColor: BrandColors.white,
    borderTopLeftRadius: Radii.cardLarge,
    borderTopRightRadius: Radii.cardLarge,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.border,
  },
  title: { ...TypeScale.h3, color: BrandColors.textHeading, flex: 1 },
  reset: { ...TypeScale.bodyBold, color: BrandColors.orange },
  close: { marginLeft: 4 },
  content: { padding: 16, gap: 14, paddingBottom: 24 },
  section: { gap: 8 },
  sectionLabel: { ...TypeScale.label, color: BrandColors.textSecondary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: Radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: BrandColors.cream100,
    borderWidth: 1,
    borderColor: BrandColors.cream400,
  },
  chipActive: { backgroundColor: BrandColors.navy, borderColor: BrandColors.navy },
  chipText: { ...TypeScale.label, color: BrandColors.textSecondary },
  chipTextActive: { color: BrandColors.white },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
    backgroundColor: BrandColors.white,
  },
  applyBtn: { width: '100%' },
});
