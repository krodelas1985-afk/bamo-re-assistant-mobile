import { useRouter } from 'expo-router';
import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BaymoBubble } from '@/components/baymo-bubble';
import { BrandColors, TypeScale } from '@/constants/brand';

/** Standard screen shell: gray app background, safe area, optional title header, scrollable content. */
export function Screen({
  title,
  children,
  showBaymo = true,
}: {
  title?: string;
  children: ReactNode;
  showBaymo?: boolean;
}) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {title ? (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      {showBaymo && <BaymoBubble onPress={() => router.push('/chat')} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BrandColors.screenBg,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    ...TypeScale.h3,
    color: BrandColors.textHeading,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
});
