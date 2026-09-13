import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Listing, ListingCard } from '@/components/listing-card';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { fetchMyListings } from '@/lib/listings';
import {
  fetchMarketplaceListings,
  marketplaceErrorText,
  MarketplaceCard,
  MarketplaceResult,
  toMarketplaceCard,
} from '@/lib/marketplace';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

/**
 * Listings: what is on BaMo Marketplace under the agent's name, then what they
 * have sent BaMo from the app that is not on the Marketplace yet.
 *
 * The two load independently. If the Marketplace cannot be reached, the agent
 * still sees what they sent; if their own captures fail, they still see the
 * Marketplace. One failure never blanks the whole tab.
 */
export default function ListingsScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [marketplace, setMarketplace] = useState<MarketplaceResult | null>(null);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);
  const [captures, setCaptures] = useState<Listing[]>([]);
  const [capturesError, setCapturesError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [mp, own] = await Promise.all([fetchMarketplaceListings(), fetchMyListings()]);
    setMarketplace(mp.data);
    setMarketplaceError(mp.error);
    setCaptures(own.data);
    setCapturesError(own.error);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const marketplaceCards: MarketplaceCard[] =
    marketplace?.linked ? marketplace.listings.map(toMarketplaceCard) : [];

  return (
    <Screen title="Listings">
      <Pressable style={styles.postBtn} onPress={() => router.push('/listing-new')}>
        <Ionicons name="add-circle" size={22} color={BrandColors.white} />
        <Text style={styles.postText}>Post your property</Text>
      </Pressable>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.navy} />
        </View>
      ) : (
        <>
          <Text style={styles.section}>On BaMo Marketplace</Text>

          {marketplaceError ? (
            <View style={styles.note}>
              <Text style={styles.noteText}>{marketplaceErrorText(marketplaceError)}</Text>
              <Button label="Try again" small onPress={load} style={styles.retry} />
            </View>
          ) : !marketplace?.linked ? (
            <View style={styles.note}>
              <Text style={styles.noteText}>
                Your BaMo Marketplace profile isn&apos;t set up yet. BaMo sets it up for you — your listings
                will appear here once it is.
              </Text>
            </View>
          ) : marketplaceCards.length === 0 ? (
            <View style={styles.note}>
              <Text style={styles.noteText}>
                No listings on the Marketplace under your name yet. When BaMo adds one, it shows here — even
                while it is still being prepared.
              </Text>
            </View>
          ) : (
            marketplaceCards.map((card) =>
              card.publicUrl ? (
                <Pressable
                  key={card.id}
                  onPress={() => Linking.openURL(card.publicUrl!)}
                  accessibilityRole="link"
                  accessibilityHint="Opens the listing on BaMo Marketplace"
                >
                  <ListingCard listing={card} />
                </Pressable>
              ) : (
                <ListingCard key={card.id} listing={card} />
              ),
            )
          )}

          <Text style={styles.section}>Sent to BaMo from the app</Text>

          {capturesError ? (
            <View style={styles.note}>
              <Text style={styles.noteText}>Couldn&apos;t load what you sent.</Text>
              <Text style={styles.errorDetail}>{capturesError}</Text>
              <Button label="Try again" small onPress={load} style={styles.retry} />
            </View>
          ) : captures.length === 0 ? (
            <View style={styles.note}>
              <Text style={styles.noteText}>
                Nothing sent yet. Tap “Post your property” and let BayMo write it up for you. 🏡
              </Text>
            </View>
          ) : (
            captures.map((listing) => <ListingCard key={listing.id} listing={listing} />)
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  postBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BrandColors.navy,
    borderRadius: Radii.button,
    paddingVertical: 14,
  },
  postText: { ...TypeScale.button, color: BrandColors.white },
  section: {
    ...TypeScale.h4,
    color: BrandColors.textHeading,
    marginTop: 8,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  note: {
    backgroundColor: BrandColors.cream200,
    borderRadius: Radii.card,
    padding: 16,
    gap: 8,
  },
  noteText: {
    ...TypeScale.body,
    color: BrandColors.textSecondary,
  },
  errorDetail: {
    ...TypeScale.bodySmall,
    color: BrandColors.textMuted,
  },
  retry: { marginTop: 4, alignSelf: 'flex-start' },
});
