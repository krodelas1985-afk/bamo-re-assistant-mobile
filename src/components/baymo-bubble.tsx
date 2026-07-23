import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandColors, Radii, TypeScale } from '@/constants/brand';

const baymoHead = require('../../assets/brand/baymo-head.png');

/**
 * BayMo floating chat pill — bottom-right on every main screen.
 * White pill: BayMo head avatar + name + green online dot (warm-cream system).
 */
export function BaymoBubble({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Chat with BayMo, your AI assistant"
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
      <Image source={baymoHead} style={styles.avatar} contentFit="cover" />
      <Text style={styles.name}>BayMo</Text>
      <View style={styles.onlineDot} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: Radii.pill,
    backgroundColor: BrandColors.white,
    shadowColor: BrandColors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: Radii.pill,
  },
  name: {
    ...TypeScale.bodyBold,
    fontSize: 12,
    color: BrandColors.ink,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: Radii.pill,
    backgroundColor: BrandColors.success,
  },
});
