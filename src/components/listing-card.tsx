import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, BadgeTone } from '@/components/ui/badge';
import { TagPill } from '@/components/ui/tag-pill';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

export type Listing = {
  id: string;
  title: string;
  location: string;
  price: number; // PHP
  bedrooms: number;
  baths: number;
  floorArea: number; // sqm
  status: string; // "Active", "Reserved"
  statusTone: BadgeTone;
  financing: string[]; // ["Pag-IBIG", "Bank Loan"]
  imageUrl?: string;
};

export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH')}`;
}

/** Listing card per the approved mockup: image w/ status pill, title, location, price, specs, financing tags. */
export function ListingCard({ listing }: { listing: Listing }) {
  return (
    <View style={styles.card}>
      <View style={styles.imageArea}>
        {listing.imageUrl ? (
          <Image source={{ uri: listing.imageUrl }} style={styles.image} contentFit="cover" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderIcon}>🏡</Text>
          </View>
        )}
        <View style={styles.statusPill}>
          <Badge label={listing.status} tone={listing.statusTone} />
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>{listing.title}</Text>
        <Text style={styles.location}>📍 {listing.location}</Text>
        <Text style={styles.price}>{formatPeso(listing.price)}</Text>
        <Text style={styles.specs}>
          {listing.bedrooms} BR · {listing.baths} T&B · {listing.floorArea} sqm
        </Text>
        {listing.financing.length > 0 && (
          <View style={styles.tags}>
            {listing.financing.map((tag) => (
              <TagPill key={tag} label={tag} cream />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    overflow: 'hidden',
  },
  imageArea: {
    height: 150,
    backgroundColor: BrandColors.cream300,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderIcon: {
    fontSize: 40,
  },
  statusPill: {
    position: 'absolute',
    top: 10,
    left: 10,
  },
  body: {
    padding: 16,
    gap: 4,
  },
  title: {
    ...TypeScale.h4,
    color: BrandColors.textHeading,
  },
  location: {
    ...TypeScale.bodySmall,
    color: BrandColors.textSecondary,
  },
  price: {
    ...TypeScale.h3,
    color: BrandColors.orange,
    marginTop: 4,
  },
  specs: {
    ...TypeScale.body,
    color: BrandColors.textBody,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
});
