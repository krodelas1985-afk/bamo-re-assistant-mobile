import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import {
  fetchListingOptions,
  submitWebsiteRequest,
  uploadHeroPhoto,
} from '@/lib/website';

export default function WebsiteRequestScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const clientId = profile?.client_id ?? null;

  const [hero, setHero] = useState<{ uri: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const [listings, setListings] = useState<{ id: string; title: string }[]>([]);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);

  const [assetsUrl, setAssetsUrl] = useState('');
  const [facts, setFacts] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [prc, setPrc] = useState('');
  const [area, setArea] = useState('');
  const [company, setCompany] = useState('');
  const [messenger, setMessenger] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  const [saving, setSaving] = useState(false);

  // Prefill agent details from the signed-in profile.
  useEffect(() => {
    if (profile?.full_name) setName(profile.full_name);
    if (profile?.email) setEmail(profile.email);
  }, [profile]);

  useEffect(() => {
    fetchListingOptions().then(setListings);
  }, []);

  const pickHero = async () => {
    if (!clientId) return;
    const res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6 });
    if (res.canceled) return;
    const a = res.assets[0];
    setUploading(true);
    const { url, error } = await uploadHeroPhoto(clientId, {
      uri: a.uri,
      base64: a.base64,
      mimeType: a.mimeType,
    });
    setUploading(false);
    if (error || !url) Alert.alert('Upload failed', error ?? 'Please try again.');
    else setHero({ uri: a.uri, url });
  };

  const toggleListing = (id: string) => {
    setLinkedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const submit = async () => {
    if (!clientId || !session?.user) {
      Alert.alert('Not ready', 'Your workspace is still being set up. Please try again shortly.');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Add your name', 'Please enter the agent name for the website.');
      return;
    }
    setSaving(true);
    const { error } = await submitWebsiteRequest(clientId, session.user.id, {
      hero_photo_url: hero?.url ?? null,
      linked_listing_ids: linkedIds,
      assets_drive_url: assetsUrl.trim() || null,
      facts: facts.trim() || null,
      agent_name: name.trim(),
      agent_phone: phone.trim() || null,
      agent_email: email.trim() || null,
      prc_number: prc.trim() || null,
      area_coverage: area.trim() || null,
      company: company.trim() || null,
      messenger_link: messenger.trim() || null,
      whatsapp_link: whatsapp.trim() || null,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not send', error);
      return;
    }
    Alert.alert(
      'Request sent 🎉',
      'Thank you for sending your request — we’ll notify you when your website is ready.',
      [{ text: 'Done', onPress: () => router.back() }],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={BrandColors.textHeading} />
        </Pressable>
        <Text style={styles.headerTitle}>Create my Website</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Hero photo */}
        <Text style={styles.section}>Hero photo</Text>
        <Text style={styles.hint}>Your main website photo — a headshot or a signature property.</Text>
        <Pressable style={styles.heroPicker} onPress={pickHero} disabled={uploading || !clientId}>
          {uploading ? (
            <ActivityIndicator color={BrandColors.navy} />
          ) : hero ? (
            <Image source={{ uri: hero.uri }} style={styles.heroImg} contentFit="cover" />
          ) : (
            <>
              <Ionicons name="image-outline" size={26} color={BrandColors.navy} />
              <Text style={styles.heroPickText}>Upload hero photo</Text>
            </>
          )}
        </Pressable>

        {/* Link BaMo listings */}
        <Text style={styles.section}>Link a BaMo Listing</Text>
        <Text style={styles.hint}>
          Choose the properties from your BaMo listings to feature on your website.
        </Text>
        {listings.length === 0 ? (
          <Text style={styles.muted}>
            You have no listings yet. Post one in the Listings tab first, or skip this for now.
          </Text>
        ) : (
          <View style={styles.pillRow}>
            {listings.map((l) => (
              <TagPill
                key={l.id}
                label={l.title || 'Untitled'}
                active={linkedIds.includes(l.id)}
                onPress={() => toggleListing(l.id)}
              />
            ))}
          </View>
        )}

        {/* Assets — Drive folder */}
        <Text style={styles.section}>Upload assets</Text>
        <Text style={styles.hint}>
          Add all your images (logo, property photos, amenities, gallery, nearby locations) to a
          Google Drive folder, set it to “Anyone with the link can view”, then paste the link here.
          Images only.
        </Text>
        <TextField
          label="Google Drive folder link"
          value={assetsUrl}
          onChangeText={setAssetsUrl}
          placeholder="https://drive.google.com/drive/folders/…"
          autoCapitalize="none"
          keyboardType="url"
        />

        {/* Facts */}
        <Text style={styles.section}>Facts</Text>
        <Text style={styles.hint}>Anything else buyers should know — highlights, promos, milestones.</Text>
        <TextField
          label="Key facts (optional)"
          value={facts}
          onChangeText={setFacts}
          placeholder="e.g. 8 years in real estate, Top Seller 2025, specializes in Batangas house & lot"
          multiline
          numberOfLines={3}
        />

        {/* Agent details */}
        <Text style={styles.section}>Agent details</Text>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="Juan Dela Cruz" autoCapitalize="words" />
        <TextField label="Phone number" value={phone} onChangeText={setPhone} placeholder="0917 123 4567" keyboardType="phone-pad" />
        <TextField label="Email" value={email} onChangeText={setEmail} placeholder="you@email.com" keyboardType="email-address" autoCapitalize="none" />
        <TextField label="PRC number" value={prc} onChangeText={setPrc} placeholder="e.g. 0012345" autoCapitalize="characters" />
        <TextField label="Area coverage" value={area} onChangeText={setArea} placeholder="e.g. Lipa, Batangas & CALABARZON" autoCapitalize="words" />
        <TextField label="Company / Brokerage" value={company} onChangeText={setCompany} placeholder="e.g. BaMo Realty" autoCapitalize="words" />
        <TextField label="Messenger link" value={messenger} onChangeText={setMessenger} placeholder="https://m.me/yourpage" autoCapitalize="none" keyboardType="url" />
        <TextField label="WhatsApp link" value={whatsapp} onChangeText={setWhatsapp} placeholder="https://wa.me/639171234567" autoCapitalize="none" keyboardType="url" />

        {!clientId && (
          <Text style={styles.warn}>
            Your workspace isn’t linked yet, so submitting is disabled. Finish onboarding first.
          </Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={saving ? 'Sending…' : 'Submit request'}
          onPress={submit}
          style={{ width: '100%' }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BrandColors.screenBg },
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
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  section: { ...TypeScale.h4, color: BrandColors.textHeading, marginTop: 8 },
  hint: { ...TypeScale.bodySmall, color: BrandColors.textBody },
  muted: { ...TypeScale.body, color: BrandColors.textMuted },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heroPicker: {
    height: 150,
    borderRadius: Radii.card,
    borderWidth: 1.5,
    borderColor: BrandColors.borderDark,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: BrandColors.white,
    overflow: 'hidden',
  },
  heroImg: { width: '100%', height: '100%' },
  heroPickText: { ...TypeScale.label, color: BrandColors.navy },
  warn: { ...TypeScale.bodySmall, color: BrandColors.error, marginTop: 4 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
    backgroundColor: BrandColors.white,
  },
});
