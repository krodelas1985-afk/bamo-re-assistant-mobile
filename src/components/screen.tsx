import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BaymoBubble } from '@/components/baymo-bubble';
import { BrandColors, TypeScale } from '@/constants/brand';

/** Standard screen shell: gray app background, safe area, optional title header, scrollable content. */
export function Screen({
  title,
  children,
  showBaymo = true,
  onBack,
}: {
  title?: string;
  children: ReactNode;
  showBaymo?: boolean;
  /** When set, the header shows a back chevron that calls this (e.g. router.back()). */
  onBack?: () => void;
}) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {title || onBack ? (
        <View style={styles.header}>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
              <Ionicons name="chevron-back" size={24} color={BrandColors.textHeading} />
            </Pressable>
          ) : null}
          {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: {
    marginLeft: -6,
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
