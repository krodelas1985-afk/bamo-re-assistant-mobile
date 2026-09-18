import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BrandColors, TypeScale } from '@/constants/brand';

/** Cold-start fallback when the OS delivers the OAuth callback to Expo Router. */
export default function MetaConnectedScreen() {
  const { status, message } = useLocalSearchParams<{ status?: string; message?: string }>();
  useEffect(() => {
    router.replace({ pathname: '/connect-page', params: {
      status: status === 'ok' ? 'ok' : 'error',
      ...(status !== 'ok' ? { message: typeof message === 'string' ? message.slice(0, 500) : 'Facebook did not complete the connection. Please try again.' } : {}),
    } });
  }, [status, message]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator color={BrandColors.navy} />
      <Text style={styles.text}>Checking your Facebook connection…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: BrandColors.screenBg,
  },
  text: { ...TypeScale.body, color: BrandColors.textSecondary },
});
