import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { useAuth } from '@/contexts/auth-context';
import { BrandColors, BrandFonts } from '@/constants/brand';

const TAB_ICONS = {
  index: 'home-outline',
  leads: 'people-outline',
  listings: 'grid-outline',
  calendar: 'calendar-outline',
  more: 'apps-outline',
} as const;

export default function TabsLayout() {
  const { session, loading, needsOnboarding } = useAuth();

  if (loading) return null;
  if (!session) return <Redirect href="/login" />;
  // Wait until the onboarding gate resolves to avoid a redirect flicker.
  if (needsOnboarding === null) return null;
  if (needsOnboarding) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: BrandColors.orange,
        tabBarInactiveTintColor: BrandColors.textMuted,
        tabBarStyle: {
          backgroundColor: BrandColors.white,
          borderTopColor: BrandColors.border,
        },
        tabBarLabelStyle: {
          fontFamily: BrandFonts.medium,
          fontSize: 11,
        },
        tabBarIcon: ({ color, size }) => (
          <Ionicons
            name={TAB_ICONS[route.name as keyof typeof TAB_ICONS] ?? 'ellipse-outline'}
            size={size}
            color={color}
          />
        ),
      })}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="leads" options={{ title: 'Leads' }} />
      <Tabs.Screen name="listings" options={{ title: 'Listings' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
