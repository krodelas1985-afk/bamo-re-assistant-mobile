import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

export default function LeadsScreen() {
  return (
    <Screen title="Leads">
      <View style={styles.placeholder}>
        <Text style={styles.placeholderTitle}>Hot · Handover · For Viewing</Text>
        <Text style={styles.placeholderBody}>
          Warm and hot leads from your campaigns will show up here — Phase 2.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 20,
    gap: 6,
  },
  placeholderTitle: {
    ...TypeScale.h4,
    color: BrandColors.textHeading,
  },
  placeholderBody: {
    ...TypeScale.body,
    color: BrandColors.textBody,
  },
});
