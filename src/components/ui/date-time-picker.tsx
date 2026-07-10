import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandColors, Radii, TypeScale } from '@/constants/brand';

/**
 * Dependency-free date & time pickers. Chosen over @expo/ui's DateTimePicker
 * because that one renders nothing on web (our verification surface) and uses a
 * mount-to-open native dialog. These are plain React Native (Modal + Pressables),
 * so they behave identically on Android, iOS, and web.
 */

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MINUTES = [0, 15, 30, 45];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

/** A tappable field that reads like a text input but opens a picker. */
function FieldButton({
  label,
  display,
  placeholder,
  icon,
  onPress,
}: {
  label: string;
  display: string | null;
  placeholder: string;
  icon: 'calendar-outline' | 'time-outline';
  onPress: () => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.control} onPress={onPress}>
        <Ionicons name={icon} size={18} color={BrandColors.navy} />
        <Text style={[styles.controlText, !display && styles.placeholder]}>
          {display ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={BrandColors.textMuted} />
      </Pressable>
    </View>
  );
}

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date | null;
  onChange: (d: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  // Month currently shown in the calendar (1st of that month).
  const [view, setView] = useState(() => {
    const base = value ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const today = new Date();
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const leading = view.getDay(); // blanks before day 1
  const cells: (number | null)[] = [
    ...Array(leading).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const shiftMonth = (delta: number) =>
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  const pick = (day: number) => {
    const base = value ?? new Date();
    onChange(new Date(view.getFullYear(), view.getMonth(), day, base.getHours(), base.getMinutes()));
    setOpen(false);
  };

  return (
    <>
      <FieldButton
        label={label}
        display={value ? fmtDate(value) : null}
        placeholder="Select a date"
        icon="calendar-outline"
        onPress={() => setOpen(true)}
      />
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.calHeader}>
              <Pressable onPress={() => shiftMonth(-1)} hitSlop={10}>
                <Ionicons name="chevron-back" size={22} color={BrandColors.navy} />
              </Pressable>
              <Text style={styles.calMonth}>
                {view.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
              </Text>
              <Pressable onPress={() => shiftMonth(1)} hitSlop={10}>
                <Ionicons name="chevron-forward" size={22} color={BrandColors.navy} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((w) => (
                <Text key={w} style={styles.weekday}>
                  {w}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((day, i) => {
                if (day === null) return <View key={`b${i}`} style={styles.cell} />;
                const cellDate = new Date(view.getFullYear(), view.getMonth(), day);
                const isSelected = value ? sameDay(cellDate, value) : false;
                const isToday = sameDay(cellDate, today);
                return (
                  <Pressable
                    key={day}
                    style={[styles.cell, isSelected && styles.cellSelected]}
                    onPress={() => pick(day)}>
                    <Text
                      style={[
                        styles.cellText,
                        isSelected && styles.cellTextSelected,
                        !isSelected && isToday && styles.cellTextToday,
                      ]}>
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date | null;
  onChange: (d: Date) => void;
}) {
  const [open, setOpen] = useState(false);

  const h24 = value ? value.getHours() : 9;
  const meridiem: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const minute = value ? value.getMinutes() : 0;

  const commit = (nextHour12: number, nextMinute: number, nextMeridiem: 'AM' | 'PM') => {
    let hours = nextHour12 % 12;
    if (nextMeridiem === 'PM') hours += 12;
    const base = value ?? new Date();
    onChange(new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, nextMinute));
  };

  return (
    <>
      <FieldButton
        label={label}
        display={value ? fmtTime(value) : null}
        placeholder="Select a time"
        icon="time-outline"
        onPress={() => setOpen(true)}
      />
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.timeLabel}>Hour</Text>
            <View style={styles.pillWrap}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                <Pressable
                  key={h}
                  style={[styles.timePill, h === hour12 && styles.timePillActive]}
                  onPress={() => commit(h, minute, meridiem)}>
                  <Text style={[styles.timePillText, h === hour12 && styles.timePillTextActive]}>
                    {h}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.timeLabel}>Minute</Text>
            <View style={styles.pillWrap}>
              {MINUTES.map((m) => (
                <Pressable
                  key={m}
                  style={[styles.timePill, m === minute && styles.timePillActive]}
                  onPress={() => commit(hour12, m, meridiem)}>
                  <Text style={[styles.timePillText, m === minute && styles.timePillTextActive]}>
                    :{String(m).padStart(2, '0')}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.timeLabel}>AM / PM</Text>
            <View style={styles.pillWrap}>
              {(['AM', 'PM'] as const).map((mer) => (
                <Pressable
                  key={mer}
                  style={[styles.timePill, mer === meridiem && styles.timePillActive]}
                  onPress={() => commit(hour12, minute, mer)}>
                  <Text style={[styles.timePillText, mer === meridiem && styles.timePillTextActive]}>
                    {mer}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.doneBtn} onPress={() => setOpen(false)}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { ...TypeScale.label, color: BrandColors.textSecondary },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: BrandColors.borderDark,
    borderRadius: Radii.button,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: BrandColors.white,
  },
  controlText: { ...TypeScale.input, flex: 1, color: BrandColors.textHeading },
  placeholder: { color: BrandColors.textMuted },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(19, 42, 92, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: BrandColors.white,
    borderRadius: Radii.cardLarge,
    padding: 16,
    gap: 10,
  },

  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calMonth: { ...TypeScale.h4, color: BrandColors.textHeading },
  weekRow: { flexDirection: 'row' },
  weekday: {
    ...TypeScale.labelSmall,
    color: BrandColors.textMuted,
    flexBasis: `${100 / 7}%`,
    textAlign: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    flexBasis: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: {
    // A rounded square highlight inside the square cell.
    backgroundColor: BrandColors.navy,
    borderRadius: Radii.button,
  },
  cellText: { ...TypeScale.body, color: BrandColors.textHeading },
  cellTextSelected: { color: BrandColors.white, fontFamily: 'Poppins_600SemiBold' },
  cellTextToday: { color: BrandColors.orange, fontFamily: 'Poppins_600SemiBold' },

  timeLabel: { ...TypeScale.label, color: BrandColors.textSecondary, marginTop: 4 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timePill: {
    minWidth: 44,
    alignItems: 'center',
    borderRadius: Radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: BrandColors.cream100,
    borderWidth: 1,
    borderColor: BrandColors.cream400,
  },
  timePillActive: { backgroundColor: BrandColors.navy, borderColor: BrandColors.navy },
  timePillText: { ...TypeScale.label, color: BrandColors.textSecondary },
  timePillTextActive: { color: BrandColors.white },
  doneBtn: {
    marginTop: 8,
    backgroundColor: BrandColors.orange,
    borderRadius: Radii.button,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneText: { ...TypeScale.button, color: BrandColors.white },
});
