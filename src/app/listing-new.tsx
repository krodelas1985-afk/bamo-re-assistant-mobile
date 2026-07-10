import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TagPill } from '@/components/ui/tag-pill';
import { TextField } from '@/components/ui/text-field';
import { UpgradeBanner } from '@/components/ui/upgrade-banner';
import { useAuth } from '@/contexts/auth-context';
import { useUsage } from '@/hooks/use-usage';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import {
  GeneratedListing,
  ListingType,
  createListing,
  generateListing,
  uploadListingPhoto,
} from '@/lib/listings';
import { atLimit } from '@/lib/usage';

const PROPERTY_TYPES = ['House & Lot', 'Condo', 'Townhouse', 'Lot', 'Commercial'];

const toNum = (s: string): number | null => {
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return s.trim() && !Number.isNaN(n) ? n : null;
};
const numStr = (n: number | null | undefined) => (n == null ? '' : String(n));

type Photo = { uri: string; url: string };

export default function NewListingScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const { usage } = useUsage();
  const clientId = profile?.client_id ?? null;
  const listingsFull = atLimit(usage?.listings);
  const aiFull = atLimit(usage?.ai);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [listingType, setListingType] = useState<ListingType>('sale');
  const [propertyType, setPropertyType] = useState('');
  const [price, setPrice] = useState('');
  const [lotArea, setLotArea] = useState('');
  const [floorArea, setFloorArea] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [location, setLocation] = useState('');
  const [city, setCity] = useState('');
  const [details, setDetails] = useState('');
  const [description, setDescription] = useState('');

  const addPhoto = async () => {
    if (!clientId) return;
    const res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6 });
    if (res.canceled) return;
    const a = res.assets[0];
    setUploading(true);
    const { url, error } = await uploadListingPhoto(clientId, {
      uri: a.uri,
      base64: a.base64,
      mimeType: a.mimeType,
    });
    setUploading(false);
    if (error || !url) Alert.alert('Upload failed', error ?? 'Please try again.');
    else setPhotos((p) => [...p, { uri: a.uri, url }]);
  };

  const askBayMo = async () => {
    if (!details.trim() && !title.trim() && !propertyType && !price) {
      Alert.alert('Add some details first', 'Type the property details or fill a few fields, then let BayMo write it up.');
      return;
    }
    setGenerating(true);
    const { listing, error } = await generateListing(details, {
      title: title || undefined,
      property_type: propertyType || undefined,
      listing_type: listingType,
      price: toNum(price),
      lot_area: toNum(lotArea),
      floor_area: toNum(floorArea),
      bedrooms: toNum(bedrooms),
      bathrooms: toNum(bathrooms),
      location: location || undefined,
      city: city || undefined,
    });
    setGenerating(false);
    if (error || !listing) {
      Alert.alert('Could not generate', error ?? 'Please try again.');
      return;
    }
    applyGenerated(listing);
  };

  const applyGenerated = (g: GeneratedListing) => {
    if (g.title) setTitle(g.title);
    if (g.property_type) setPropertyType(g.property_type);
    if (g.listing_type === 'sale' || g.listing_type === 'rent') setListingType(g.listing_type);
    if (g.price != null) setPrice(String(g.price));
    if (g.lot_area != null) setLotArea(String(g.lot_area));
    if (g.floor_area != null) setFloorArea(String(g.floor_area));
    if (g.bedrooms != null) setBedrooms(String(g.bedrooms));
    if (g.bathrooms != null) setBathrooms(String(g.bathrooms));
    if (g.location) setLocation(g.location);
    if (g.city) setCity(g.city);
    if (g.description) setDescription(g.description);
  };

  const save = async (status: 'draft' | 'published') => {
    if (!clientId || !session?.user) {
      Alert.alert('Not ready', 'Your workspace is still being set up. Please try again shortly.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Add a title', 'Give your listing a title, or tap “Ask BayMo to generate”.');
      return;
    }
    setSaving(true);
    const { error } = await createListing(clientId, session.user.id, {
      title: title.trim(),
      listing_type: listingType,
      property_type: propertyType || null,
      price: toNum(price),
      lot_area: toNum(lotArea),
      floor_area: toNum(floorArea),
      bedrooms: toNum(bedrooms),
      bathrooms: toNum(bathrooms),
      location: location.trim() || null,
      city: city.trim() || null,
      description: description.trim() || null,
      photo_urls: photos.map((p) => p.url),
      status,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error);
      return;
    }
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={BrandColors.textHeading} />
        </Pressable>
        <Text style={styles.headerTitle}>Post your property</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {listingsFull && (
          <UpgradeBanner
            message={`You've reached your free plan's ${usage?.listings.limit}-listing limit. Upgrade to publish more.`}
          />
        )}

        {/* Photos */}
        <Text style={styles.section}>Photos</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.photoRow}>
            {photos.map((p) => (
              <Image key={p.url} source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" />
            ))}
            <Pressable style={styles.addPhoto} onPress={addPhoto} disabled={uploading || !clientId}>
              {uploading ? (
                <ActivityIndicator color={BrandColors.navy} />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={22} color={BrandColors.navy} />
                  <Text style={styles.addPhotoText}>Add</Text>
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>

        {/* AI generator */}
        <View style={styles.aiCard}>
          <Text style={styles.aiTitle}>✨ AI Listing Generator</Text>
          <Text style={styles.aiSub}>
            Type the property details below (or fill a few fields), then let BayMo write the title
            and description for you.
          </Text>
          <TextField
            label="Property details / notes"
            value={details}
            onChangeText={setDetails}
            placeholder="e.g. 3BR house and lot in Lipa, 120sqm lot, 90sqm floor, near SM, ₱4.5M, Pag-IBIG ok"
            multiline
            numberOfLines={3}
          />
          <Button
            label={
              aiFull
                ? 'Monthly AI limit reached'
                : generating
                ? 'BayMo is writing…'
                : '✨ Ask BayMo to generate'
            }
            onPress={askBayMo}
            disabled={aiFull}
            style={styles.aiBtn}
          />
          {aiFull && (
            <Text style={styles.aiSub}>
              You&apos;ve used all {usage?.ai.limit} free AI credits this month. You can still fill in
              the listing yourself.
            </Text>
          )}
        </View>

        {/* Structured fields */}
        <Text style={styles.section}>Details</Text>
        <TextField label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Modern 3BR House & Lot in Lipa" />

        <Text style={styles.fieldLabel}>Listing type</Text>
        <View style={styles.pillRow}>
          <TagPill label="For Sale" active={listingType === 'sale'} onPress={() => setListingType('sale')} />
          <TagPill label="For Rent" active={listingType === 'rent'} onPress={() => setListingType('rent')} />
        </View>

        <Text style={styles.fieldLabel}>Property type</Text>
        <View style={styles.pillRow}>
          {PROPERTY_TYPES.map((t) => (
            <TagPill key={t} label={t} active={propertyType === t} onPress={() => setPropertyType(t)} />
          ))}
        </View>

        <TextField label="Price (₱)" value={price} onChangeText={setPrice} placeholder="4500000" keyboardType="numeric" />
        <View style={styles.twoCol}>
          <View style={styles.flex}>
            <TextField label="Lot area (sqm)" value={lotArea} onChangeText={setLotArea} placeholder="120" keyboardType="numeric" />
          </View>
          <View style={styles.flex}>
            <TextField label="Floor area (sqm)" value={floorArea} onChangeText={setFloorArea} placeholder="90" keyboardType="numeric" />
          </View>
        </View>
        <View style={styles.twoCol}>
          <View style={styles.flex}>
            <TextField label="Bedrooms" value={bedrooms} onChangeText={setBedrooms} placeholder="3" keyboardType="numeric" />
          </View>
          <View style={styles.flex}>
            <TextField label="Bathrooms" value={bathrooms} onChangeText={setBathrooms} placeholder="2" keyboardType="numeric" />
          </View>
        </View>
        <TextField label="Location" value={location} onChangeText={setLocation} placeholder="Brgy. Sabang, Lipa" autoCapitalize="words" />
        <TextField label="City" value={city} onChangeText={setCity} placeholder="Batangas" autoCapitalize="words" />
        <TextField
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Tap “Ask BayMo to generate”, or write your own."
          multiline
          numberOfLines={4}
        />

        {!clientId && (
          <Text style={styles.warn}>
            Your workspace isn&apos;t linked yet, so saving is disabled. Finish onboarding first.
          </Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Save draft"
          variant="secondary"
          onPress={() => save('draft')}
          disabled={listingsFull}
          style={styles.footerBtn}
        />
        <Button
          label={listingsFull ? 'Listing limit reached' : saving ? 'Saving…' : 'Publish'}
          onPress={() => save('published')}
          disabled={listingsFull}
          style={styles.footerBtn}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BrandColors.screenBg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: BrandColors.white,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.border,
  },
  headerTitle: { ...TypeScale.h4, color: BrandColors.textHeading },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  section: { ...TypeScale.h4, color: BrandColors.textHeading, marginTop: 4 },
  fieldLabel: { ...TypeScale.label, color: BrandColors.textSecondary },
  photoRow: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  thumb: { width: 84, height: 84, borderRadius: Radii.button, backgroundColor: BrandColors.cream300 },
  addPhoto: {
    width: 84,
    height: 84,
    borderRadius: Radii.button,
    borderWidth: 1.5,
    borderColor: BrandColors.borderDark,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: BrandColors.white,
  },
  addPhotoText: { ...TypeScale.labelSmall, color: BrandColors.navy },
  aiCard: {
    backgroundColor: BrandColors.cream100,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: BrandColors.orangeSoft,
    padding: 16,
    gap: 10,
  },
  aiTitle: { ...TypeScale.h4, color: BrandColors.orangeDark },
  aiSub: { ...TypeScale.bodySmall, color: BrandColors.textBody },
  aiBtn: { marginTop: 2 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  twoCol: { flexDirection: 'row', gap: 12 },
  warn: { ...TypeScale.bodySmall, color: BrandColors.error, marginTop: 4 },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
    backgroundColor: BrandColors.white,
  },
  footerBtn: { flex: 1 },
});
