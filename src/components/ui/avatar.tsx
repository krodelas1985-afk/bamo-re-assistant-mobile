import { StyleSheet, Text, View } from 'react-native';

import { BrandColors, Radii, TypeScale } from '@/constants/brand';

/** Navy circle with initials — used on lead cards and contact rows. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: Radii.pill }]}>
      <Text style={[styles.initials, { fontSize: size * 0.35 }]}>{initials || '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: BrandColors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    ...TypeScale.bodyBold,
    color: BrandColors.white,
    lineHeight: undefined,
  },
});
