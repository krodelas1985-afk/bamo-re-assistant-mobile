import { StyleSheet, Text, View } from 'react-native';

import { Listing, ListingCard } from '@/components/listing-card';
import { Screen } from '@/components/screen';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

// Sample data — replaced by live BaMo Marketplace listings in Phase 3.
const SAMPLE_LISTINGS: Listing[] = [
  {
    id: '1',
    title: 'MIRA — 2BR Townhouse',
    location: 'Vermira Living Spaces, Lipa, Batangas',
    price: 4250000,
    bedrooms: 2,
    baths: 2,
    floorArea: 88,
    status: 'Active',
    statusTone: 'success',
    financing: ['Pag-IBIG', 'Bank Loan', 'In-house'],
  },
  {
    id: '2',
    title: 'ALON — 3BR Single Attached',
    location: 'Vermira Living Spaces, Lipa, Batangas',
    price: 5800000,
    bedrooms: 3,
    baths: 2,
    floorArea: 120,
    status: 'Reserved',
    statusTone: 'warm',
    financing: ['Bank Loan', 'In-house'],
  },
];

export default function ListingsScreen() {
  return (
    <Screen title="Listings">
      <View style={styles.syncBanner}>
        <Text style={styles.syncText}>Synced with BaMo Marketplace · bahaymo.com</Text>
      </View>

      {SAMPLE_LISTINGS.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
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
});
