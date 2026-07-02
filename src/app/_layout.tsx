import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { Inter_400Regular } from '@expo-google-fonts/inter';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Tabs } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { BrandColors, BrandFonts } from '@/constants/brand';

SplashScreen.preventAutoHideAsync();

const TAB_ICONS = {
  index: 'home-outline',
  leads: 'people-outline',
  listings: 'grid-outline',
  calendar: 'calendar-outline',
  more: 'apps-outline',
} as const;

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Inter_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

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
