import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

export default function CalendarScreen() {
  return (
    <Screen title="Calendar">
      <View style={styles.placeholder}>
        <Text style={styles.placeholderTitle}>Upcoming</Text>
        <Text style={styles.placeholderBody}>
          Trippings, site viewings, and calls will show up here — Phase 3.
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
