import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { BrandColors, Radii } from '@/constants/brand';

const baymoAvatar = require('../../assets/brand/baymo.png');

/**
 * BayMo floating chat bubble — bottom-right on every main screen.
 * Circular avatar with orange ring and green online dot.
 * Opens the assistant chat (Phase 4); onPress is a no-op until then.
 */
export function BaymoBubble({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Chat with BayMo, your AI assistant"
      style={({ pressed }) => [styles.bubble, pressed && styles.pressed]}>
      <Image source={baymoAvatar} style={styles.avatar} contentFit="cover" />
      <View style={styles.onlineDot} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    right: 16,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: Radii.pill,
    borderWidth: 2.5,
    borderColor: BrandColors.orange,
    backgroundColor: BrandColors.white,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: Radii.pill,
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 13,
    height: 13,
    borderRadius: Radii.pill,
    backgroundColor: BrandColors.success,
    borderWidth: 2,
    borderColor: BrandColors.white,
  },
});
