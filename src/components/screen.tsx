import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BaymoBubble } from '@/components/baymo-bubble';
import { BrandColors, CardShadow, TypeScale } from '@/constants/brand';

/** Shared cream canvas, consistent header, and keyboard-aware content. */
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
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} hitSlop={12} style={styles.back}>
              <Ionicons name="chevron-back" size={20} color={BrandColors.ink} />
            </Pressable>
          ) : null}
          {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
          {headerRight ? <View style={styles.headerRight}>{headerRight}</View> : null}
        </View>
      ) : null}
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled">
        {children}
      </KeyboardAwareScrollView>
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
    width: 44,
    height: 44,
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
    flexShrink: 1,
    color: BrandColors.ink,
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 112,
  },
});
