import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { Inter_400Regular } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AuthProvider } from '@/contexts/auth-context';

SplashScreen.preventAutoHideAsync();

// Show notifications while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Route a tapped notification to the screen named in its data.route. */
function openFromNotification(response: Notifications.NotificationResponse | null) {
  const route = response?.notification.request.content.data?.route;
  if (typeof route === 'string' && route.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push(route as any);
  }
}

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

  // Deep-link on notification tap: warm taps via the listener, cold start via
  // the last response.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    Notifications.getLastNotificationResponseAsync().then(openFromNotification);
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="chat" options={{ presentation: 'modal' }} />
        <Stack.Screen name="lead/[id]" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="listing-new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="appointment-new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="website" />
        <Stack.Screen name="website-request" options={{ presentation: 'modal' }} />
        <Stack.Screen name="documents" />
        <Stack.Screen name="document-editor" options={{ presentation: 'modal' }} />
        <Stack.Screen name="social" />
        <Stack.Screen name="autopost-setup" options={{ presentation: 'modal' }} />
        <Stack.Screen name="post-compose" options={{ presentation: 'modal' }} />
        <Stack.Screen name="video-request" options={{ presentation: 'modal' }} />
        <Stack.Screen name="ads" />
        <Stack.Screen name="campaign-request" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" />
      </Stack>
    </AuthProvider>
  );
}
