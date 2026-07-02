import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandColors, TypeScale } from '@/constants/brand';

/** Standard screen shell: gray app background, safe area, optional title header, scrollable content. */
export function Screen({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {title ? (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
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
