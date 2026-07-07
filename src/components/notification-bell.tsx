import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandColors, TypeScale } from '@/constants/brand';
import { fetchUnreadCount } from '@/lib/notifications';

/** Header bell with an unread-count badge; refreshes whenever its screen focuses. */
export function NotificationBell() {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchUnreadCount().then((c) => {
        if (active) setCount(c);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <Pressable onPress={() => router.push('/notifications')} hitSlop={10} style={styles.wrap}>
      <Ionicons name="notifications-outline" size={24} color={BrandColors.textHeading} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 2 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: BrandColors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    ...TypeScale.labelSmall,
    color: BrandColors.white,
    fontSize: 10,
    lineHeight: 14,
  },
});
