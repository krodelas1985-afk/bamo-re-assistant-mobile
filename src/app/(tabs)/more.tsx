import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

const ITEMS = [
  { icon: 'share-social-outline', title: 'Social Media', subtitle: 'Auto-posting, posts & videos', route: '/social' },
  { icon: 'navigate-outline', title: 'Ads Management', subtitle: 'Analytics, run & manage ads', route: null },
  { icon: 'globe-outline', title: 'My Website', subtitle: 'Your agent website, visits & leads', route: '/website' },
  { icon: 'document-text-outline', title: 'Documents', subtitle: 'Authority to Sell, MOA, CTS, LOI', route: '/documents' },
  { icon: 'settings-outline', title: 'Settings', subtitle: 'Profile, accounts, notifications', route: null },
] as const;

export default function MoreScreen() {
  const router = useRouter();
  const { profile, session, signOut } = useAuth();

  return (
    <Screen title="More">
      {ITEMS.map((item) => {
        const route = item.route;
        return (
          <Pressable
            key={item.title}
            style={styles.row}
            onPress={route ? () => router.push(route) : undefined}>
            <View style={styles.iconCircle}>
              <Ionicons name={item.icon} size={20} color={BrandColors.navy} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BrandColors.textMuted} />
          </Pressable>
        );
      })}

      <Pressable style={styles.row} onPress={signOut}>
        <View style={styles.iconCircle}>
          <Ionicons name="log-out-outline" size={20} color={BrandColors.error} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: BrandColors.error }]}>Sign out</Text>
          <Text style={styles.rowSubtitle}>
            {profile?.email ?? session?.user.email ?? ''}
          </Text>
        </View>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BrandColors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...TypeScale.h4,
    color: BrandColors.textHeading,
  },
  rowSubtitle: {
    ...TypeScale.bodySmall,
    color: BrandColors.textBody,
  },
});
