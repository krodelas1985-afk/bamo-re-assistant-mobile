import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import { relativeTime } from '@/lib/leads';
import {
  AppNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/notifications';

function visualFor(type: string): { icon: keyof typeof Ionicons.glyphMap; tint: string } {
  switch (type) {
    case 'lead_hot':
      return { icon: 'flame', tint: BrandColors.orange };
    case 'lead_warm':
      return { icon: 'flame-outline', tint: BrandColors.orangeDark };
    case 'lead_assigned':
      return { icon: 'person-add', tint: BrandColors.success };
    case 'lead_reassigned_away':
      return { icon: 'swap-horizontal-outline', tint: BrandColors.textMuted };
    case 'appointment_reminder_hour':
      return { icon: 'alarm', tint: BrandColors.orange };
    case 'appointment_booked':
    case 'appointment_reminder_day':
      return { icon: 'calendar', tint: BrandColors.navy };
    default:
      return { icon: 'notifications', tint: BrandColors.navy };
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: e } = await fetchNotifications();
    if (e) setError(e);
    else setItems(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onOpen = async (n: AppNotification) => {
    if (!n.readAt) {
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      markNotificationRead(n.id);
    }
    if (n.route) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push(n.route as any);
    }
  };

  const onMarkAll = async () => {
    const now = new Date().toISOString();
    setItems((xs) => xs.map((x) => (x.readAt ? x : { ...x, readAt: now })));
    await markAllNotificationsRead();
  };

  const hasUnread = items.some((n) => !n.readAt);

  return (
    <Screen title="Notifications" onBack={() => router.back()}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.navy} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Couldn&apos;t load your notifications.</Text>
          <Button label="Try again" small onPress={load} style={{ marginTop: 4 }} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="notifications-outline" size={30} color={BrandColors.navy} />
          </View>
          <Text style={styles.emptyText}>
            You&apos;re all caught up. New leads, hot/warm alerts, and appointment reminders will
            appear here.
          </Text>
        </View>
      ) : (
        <>
          {hasUnread ? (
            <Pressable onPress={onMarkAll} style={styles.markAll} hitSlop={8}>
              <Text style={styles.markAllText}>Mark all as read</Text>
            </Pressable>
          ) : null}
          {items.map((n) => {
            const v = visualFor(n.type);
            return (
              <Pressable
                key={n.id}
                onPress={() => onOpen(n)}
                style={[styles.row, !n.readAt && styles.rowUnread]}>
                <View style={styles.iconCircle}>
                  <Ionicons name={v.icon} size={20} color={v.tint} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{n.title}</Text>
                  {n.body ? <Text style={styles.rowSubtitle}>{n.body}</Text> : null}
                  <Text style={styles.rowTime}>{relativeTime(n.createdAt)}</Text>
                </View>
                {!n.readAt ? <View style={styles.unreadDot} /> : null}
              </Pressable>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: BrandColors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...TypeScale.body,
    color: BrandColors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  markAll: { alignSelf: 'flex-end', paddingVertical: 2, paddingHorizontal: 4 },
  markAllText: { ...TypeScale.label, color: BrandColors.navy },
  row: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowUnread: {
    backgroundColor: BrandColors.cream100,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BrandColors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...TypeScale.h4, color: BrandColors.textHeading },
  rowSubtitle: { ...TypeScale.bodySmall, color: BrandColors.textBody },
  rowTime: { ...TypeScale.bodySmall, color: BrandColors.textMuted, marginTop: 2 },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BrandColors.orange,
  },
});
