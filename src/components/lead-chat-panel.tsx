import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import { fetchMyListings } from '@/lib/listings';
import type { Listing } from '@/components/listing-card';
import type { LeadChatContext } from '@/lib/chat-history-store';

/** Explicit selection only: a preference or budget is not a confirmed property link. */
export function LeadChatPanel({
  context,
  name,
  loading,
  error,
  disabled,
  onRetry,
  onProperty,
  onTask,
  onAppointment,
}: {
  context: LeadChatContext;
  name: string;
  loading: boolean;
  error: string | null;
  disabled: boolean;
  onRetry: () => void;
  onProperty: (listing?: { id: string; title: string }) => void;
  onTask: () => void;
  onAppointment: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchMyListings()
      .then(({ data, error: failure }) => {
        if (cancelled) return;
        setListings(data);
        setListingError(
          failure ? 'Could not load properties. Please retry.' : null,
        );
      })
      .catch(() => {
        if (!cancelled)
          setListingError('Could not load properties. Please retry.');
      })
      .finally(() => {
        if (!cancelled) setLoadingListings(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, retry]);
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>About {name}</Text>
      {loading ? (
        <ActivityIndicator
          accessibilityLabel="Checking lead"
          color={BrandColors.ink}
        />
      ) : error ? (
        <View>
          <Text style={styles.error}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={onRetry}>
            <Text style={styles.link}>Retry lead</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose property"
            disabled={disabled}
            onPress={() => {
              setLoadingListings(true);
              setListingError(null);
              setOpen(true);
            }}
          >
            <Text numberOfLines={2} style={styles.link}>
              {context.listingTitle
                ? `Property: ${context.listingTitle} · Change`
                : 'No property selected · Choose property'}
            </Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={onTask}
              style={styles.button}
            >
              <Text style={styles.label}>Create follow-up task</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={onAppointment}
              style={styles.button}
            >
              <Text style={styles.label}>Schedule appointment</Text>
            </Pressable>
          </View>
          <Text style={styles.note}>
            BayMo will ask for the details and show a review card. Nothing is
            saved until you tap Confirm.
          </Text>
        </>
      )}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.overlay}>
          <SafeAreaView style={styles.sheet}>
            <View style={styles.actions}>
              <Text style={[styles.title, { flex: 1 }]}>Choose a property</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close properties"
                onPress={() => setOpen(false)}
              >
                <Text style={styles.link}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.note}>
              Select a listing to discuss with BayMo. This does not change the
              lead’s profile.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onProperty();
                setOpen(false);
              }}
              style={styles.button}
            >
              <Text style={styles.label}>No property</Text>
            </Pressable>
            {loadingListings ? (
              <ActivityIndicator accessibilityLabel="Loading properties" />
            ) : listingError ? (
              <View>
                <Text style={styles.error}>{listingError}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setLoadingListings(true);
                    setListingError(null);
                    setRetry((n) => n + 1);
                  }}
                >
                  <Text style={styles.link}>Retry properties</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ gap: 10 }}>
                {listings.length === 0 && (
                  <Text style={styles.note}>
                    No listings available in your account yet.
                  </Text>
                )}
                {listings.map((listing) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Select property: ${listing.title}`}
                    key={listing.id}
                    style={styles.button}
                    onPress={() => {
                      onProperty(listing);
                      setOpen(false);
                    }}
                  >
                    <Text style={styles.title}>{listing.title}</Text>
                    <Text style={styles.note}>
                      {listing.location} · {listing.status}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  panel: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    gap: 8,
    borderRadius: Radii.card,
    backgroundColor: BrandColors.coralSoft,
  },
  title: { ...TypeScale.bodyBold, color: BrandColors.ink },
  link: {
    ...TypeScale.bodySmall,
    color: BrandColors.coralDark,
    paddingVertical: 6,
  },
  note: { ...TypeScale.bodySmall, color: BrandColors.textMuted },
  error: { ...TypeScale.bodySmall, color: BrandColors.error },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  button: {
    padding: 10,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: BrandColors.white,
  },
  label: { ...TypeScale.label, color: BrandColors.ink },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,.35)',
  },
  sheet: {
    height: '75%',
    padding: 20,
    gap: 12,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: BrandColors.screenBg,
  },
});
