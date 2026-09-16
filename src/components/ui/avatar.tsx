import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BrandColors, Radii, TypeScale } from '@/constants/brand';

/**
 * Navy circle with initials — used on lead cards and contact rows. Given a
 * photo `uri`, shows the photo instead, and falls back to initials if it fails
 * to load.
 */
export function Avatar({ name, size = 40, uri }: { name: string; size?: number; uri?: string | null }) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
  const showPhoto = !!uri && uri !== failedUri;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: Radii.pill }]}>
      {showPhoto ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          accessibilityLabel={name ? `Photo of ${name}` : 'Profile photo'}
          onError={() => setFailedUri(uri)}
        />
      ) : (
        <Text style={[styles.initials, { fontSize: size * 0.35 }]}>{initials || '?'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: BrandColors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    ...TypeScale.bodyBold,
    color: BrandColors.white,
    lineHeight: undefined,
  },
});
