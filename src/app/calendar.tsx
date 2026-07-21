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
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

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

  return (
    <Screen title="Calendar" onBack={() => router.back()}>
      <Pressable style={styles.scheduleBtn} onPress={() => router.push('/appointment-new')}>
        <Ionicons name="add-circle" size={22} color={BrandColors.white} />
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
          <Text style={styles.emptyText}>
            No upcoming appointments. Tap “Schedule appointment” to add a viewing or a call. 📅
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
  scheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BrandColors.orange,
    borderRadius: Radii.button,
    paddingVertical: 14,
  },
  scheduleText: { ...TypeScale.button, color: BrandColors.white },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { ...TypeScale.body, color: BrandColors.textSecondary, textAlign: 'center', paddingHorizontal: 24 },
  errorDetail: { ...TypeScale.bodySmall, color: BrandColors.textMuted, textAlign: 'center', paddingHorizontal: 24 },
  retry: { marginTop: 4 },
  group: { gap: 10 },
  groupLabel: { ...TypeScale.label, color: BrandColors.textMuted, marginTop: 4 },
  card: { backgroundColor: BrandColors.white, borderRadius: Radii.card, padding: 16, gap: 12 },
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
