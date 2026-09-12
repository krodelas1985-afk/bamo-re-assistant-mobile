import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';

import { useAuth } from '@/contexts/auth-context';
import { BrandColors, BrandFonts } from '@/constants/brand';

const TAB_ICONS = {
  index: 'home-outline',
  leads: 'people-outline',
  listings: 'grid-outline',
  social: 'share-social-outline',
  more: 'apps-outline',
} as const;

export default function TabsLayout() {
  const { session, loading, needsOnboarding, needsTour } = useAuth();

  if (loading) return null;
  if (!session) return <Redirect href="/login" />;
  // Wait until both gates resolve to avoid a redirect flicker.
  if (needsOnboarding === null) return null;
  if (needsOnboarding) return <Redirect href="/onboarding" />;
  // "Meet BayMo" welcome tour: every first login (baymo_admin excluded upstream).
  if (needsTour === null) return null;
  if (needsTour) return <Redirect href="/welcome" />;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: BrandColors.navy,
        tabBarInactiveTintColor: BrandColors.textMuted,
        tabBarStyle: {
          backgroundColor: BrandColors.white,
          borderTopColor: BrandColors.border,
        },
        tabBarLabelStyle: {
          fontFamily: BrandFonts.medium,
          fontSize: 12,
        },
        tabBarIcon: ({ color, size, focused }) => (
          <View style={{ width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? BrandColors.orangeSoft : 'transparent' }}>
          <Ionicons
            name={TAB_ICONS[route.name as keyof typeof TAB_ICONS] ?? 'ellipse-outline'}
            size={size}
            color={color}
          />
          </View>
        ),
      })}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="leads" options={{ title: 'Leads' }} />
      <Tabs.Screen name="listings" options={{ title: 'Listings' }} />
      <Tabs.Screen name="social" options={{ title: 'Social Media' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
