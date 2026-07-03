import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Listing, ListingCard } from '@/components/listing-card';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { fetchMyListings } from '@/lib/listings';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

export default function ListingsScreen() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: e } = await fetchMyListings();
    if (e) setError(e);
    else setListings(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

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
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Couldn&apos;t load your listings.</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <Button label="Try again" small onPress={load} style={styles.retry} />
        </View>
      ) : listings.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            No listings yet. Tap “Post your property” and let BayMo write it up for you. 🏡
          </Text>
        </View>
      ) : (
        listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)
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
    backgroundColor: BrandColors.orange,
    borderRadius: Radii.button,
    paddingVertical: 14,
  },
  postText: { ...TypeScale.button, color: BrandColors.white },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  emptyText: {
    ...TypeScale.body,
    color: BrandColors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  errorDetail: {
    ...TypeScale.bodySmall,
    color: BrandColors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retry: { marginTop: 4 },
});
