import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

export default function ListingsScreen() {
  return (
    <Screen title="Listings">
      <View style={styles.syncBanner}>
        <Text style={styles.syncText}>Synced with BaMo Marketplace · bahaymo.com</Text>
      </View>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderBody}>
          Your live listings from the BaMo Marketplace will show up here — Phase 3.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  syncBanner: {
    backgroundColor: BrandColors.cream200,
    borderRadius: Radii.button,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  syncText: {
    ...TypeScale.label,
    color: BrandColors.orangeDark,
    textAlign: 'center',
  },
  placeholder: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 20,
  },
  placeholderBody: {
    ...TypeScale.body,
    color: BrandColors.textBody,
  },
});
