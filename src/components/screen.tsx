import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BaymoBubble } from '@/components/baymo-bubble';
import { BrandColors, CardShadow, TypeScale } from '@/constants/brand';

/** Standard screen shell: gray app background, safe area, optional title header, scrollable content. */
export function Screen({
  title,
  children,
  showBaymo = true,
  onBack,
  headerRight,
}: {
  title?: string;
  children: ReactNode;
  showBaymo?: boolean;
  /** When set, the header shows a back chevron that calls this (e.g. router.back()). */
  onBack?: () => void;
  /** Optional element pinned to the right of the header (e.g. a notification bell). */
  headerRight?: ReactNode;
}) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {title || onBack || headerRight ? (
        <View style={styles.header}>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
              <Ionicons name="chevron-back" size={20} color={BrandColors.ink} />
            </Pressable>
          ) : null}
          {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
          {headerRight ? <View style={styles.headerRight}>{headerRight}</View> : null}
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
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: BrandColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...CardShadow,
  },
  headerRight: {
    marginLeft: 'auto',
  },
  headerTitle: {
    ...TypeScale.h1,
    color: BrandColors.ink,
  },
  content: {
    padding: 20,
    gap: 12,
    paddingBottom: 40,
  },
});
