import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import {
  Appointment,
  appointmentTitle,
  fetchUpcoming,
  googleCalendarUrl,
  groupByDay,
  setAppointmentStatus,
  timeLabel,
  typeMeta,
} from '@/lib/appointments';
import { BrandColors, CardShadow, Radii, TypeScale } from '@/constants/brand';

export default function CalendarScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: e } = await fetchUpcoming();
    if (e) setError(e);
    else setItems(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const groups = useMemo(() => groupByDay(items), [items]);

  const act = useCallback(async (id: string, status: 'completed' | 'cancelled') => {
    setItems((prev) => prev.filter((a) => a.id !== id)); // optimistic
    const { error: e } = await setAppointmentStatus(id, status);
    if (e) {
      Alert.alert('Could not update', e);
      load();
    }
  }, [load]);

  const week = useMemo(() => {
    const days = [];
    const today = new Date();
    const hasApptOn = (d: Date) =>
      items.some((a) => new Date(a.scheduled_at).toDateString() === d.toDateString());
    for (let i = 0; i < 6; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      days.push({
        dow: d.toLocaleDateString('en-PH', { weekday: 'short' }),
        num: d.getDate(),
        isToday: i === 0,
        hasAppt: hasApptOn(d),
      });
    }
    return days;
  }, [items]);

  return (
    <Screen title="Calendar" onBack={() => router.back()}>
      <View style={styles.weekStrip}>
        {week.map((d) => (
          <View key={d.dow + d.num} style={[styles.dayCell, d.isToday && styles.dayCellToday]}>
            <Text style={[styles.dayDow, d.isToday && styles.dayDowToday]}>{d.dow}</Text>
            <Text style={[styles.dayNum, d.isToday && styles.dayNumToday]}>{d.num}</Text>
            {d.hasAppt ? <View style={styles.dayDot} /> : null}
          </View>
        ))}
      </View>
      <Pressable style={styles.scheduleBtn} onPress={() => router.push('/appointment-new')}>
        <View style={styles.scheduleIcon}>
          <Ionicons name="add" size={16} color={BrandColors.white} />
        </View>
        <Text style={styles.scheduleText}>Schedule appointment</Text>
      </Pressable>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.navy} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Couldn&apos;t load your calendar.</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <Button label="Try again" small onPress={load} style={styles.retry} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="calendar-outline" size={34} color={BrandColors.infoDeep} />
          </View>
          <Text style={styles.emptyTitle}>Wala pang appointments</Text>
          <Text style={styles.emptyText}>
            Tap “Schedule appointment” to add a property viewing or a call with a lead.
          </Text>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.label} style={styles.group}>
            <Text style={styles.groupLabel}>{g.label}</Text>
            {g.items.map((a) => (
              <AppointmentCard key={a.id} appt={a} onAct={act} />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

function AppointmentCard({
  appt,
  onAct,
}: {
  appt: Appointment;
  onAct: (id: string, status: 'completed' | 'cancelled') => void;
}) {
  const meta = typeMeta(appt.appointment_type);
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>{meta.emoji}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{appointmentTitle(appt)}</Text>
          <Text style={styles.meta}>
            {timeLabel(appt.scheduled_at)} · {meta.label}
          </Text>
          {appt.location ? <Text style={styles.location}>📍 {appt.location}</Text> : null}
          {appt.notes ? <Text style={styles.notes}>{appt.notes}</Text> : null}
        </View>
      </View>
      <Pressable
        style={styles.addCal}
        onPress={() => Linking.openURL(googleCalendarUrl(appt)).catch(() => {})}>
        <Ionicons name="calendar-outline" size={16} color={BrandColors.navy} />
        <Text style={styles.addCalText}>Add to Calendar</Text>
      </Pressable>
      <View style={styles.actions}>
        <Button label="Mark done" small onPress={() => onAct(appt.id, 'completed')} style={styles.actionBtn} />
        <Button label="Cancel" variant="secondary" small onPress={() => onAct(appt.id, 'cancelled')} style={styles.actionBtn} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  weekStrip: { flexDirection: 'row', gap: 6 },
  dayCell: {
    flex: 1,
    backgroundColor: BrandColors.white,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    alignItems: 'center',
    ...CardShadow,
  },
  dayCellToday: { backgroundColor: BrandColors.ink },
  dayDow: { ...TypeScale.labelSmall, color: BrandColors.textSecondary },
  dayDowToday: { color: 'rgba(255,255,255,.7)' },
  dayNum: { ...TypeScale.h3, color: BrandColors.ink, marginTop: 2 },
  dayNumToday: { color: BrandColors.white },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: Radii.pill,
    backgroundColor: BrandColors.coral,
    marginTop: 4,
  },
  scheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: BrandColors.coral,
    borderRadius: Radii.button,
    paddingVertical: 16,
    shadowColor: BrandColors.coral,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  scheduleIcon: {
    width: 24,
    height: 24,
    borderRadius: Radii.pill,
    backgroundColor: 'rgba(255,255,255,.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleText: { ...TypeScale.button, color: BrandColors.white },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10 },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: BrandColors.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: { ...TypeScale.h2, color: BrandColors.ink, textAlign: 'center' },
  emptyText: { ...TypeScale.body, color: BrandColors.textSecondary, textAlign: 'center', paddingHorizontal: 24 },
  errorDetail: { ...TypeScale.bodySmall, color: BrandColors.textMuted, textAlign: 'center', paddingHorizontal: 24 },
  retry: { marginTop: 4 },
  group: { gap: 10 },
  groupLabel: { ...TypeScale.label, color: BrandColors.textMuted, marginTop: 4 },
  card: { backgroundColor: BrandColors.white, borderRadius: Radii.card, padding: 16, gap: 12, ...CardShadow },
  topRow: { flexDirection: 'row', gap: 12 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: Radii.pill,
    backgroundColor: BrandColors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 20 },
  info: { flex: 1, gap: 2 },
  name: { ...TypeScale.h4, color: BrandColors.textHeading },
  meta: { ...TypeScale.bodySmall, color: BrandColors.textSecondary },
  location: { ...TypeScale.bodySmall, color: BrandColors.textBody, marginTop: 2 },
  notes: { ...TypeScale.bodySmall, color: BrandColors.textMuted, marginTop: 2 },
  addCal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: Radii.button,
    backgroundColor: BrandColors.cream100,
  },
  addCalText: { ...TypeScale.bodyBold, color: BrandColors.navy },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1 },
});
