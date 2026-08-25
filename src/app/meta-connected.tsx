import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BrandColors, TypeScale } from '@/constants/brand';

/** Cold-start fallback when the OS delivers the OAuth callback to Expo Router. */
export default function MetaConnectedScreen() {
  useEffect(() => {
    router.replace('/connect-page');
  }, []);

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
