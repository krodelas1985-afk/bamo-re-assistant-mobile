import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
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
import { BrandColors, TypeScale } from '@/constants/brand';
import { submitVideoRequest } from '@/lib/social';
import { fetchListingOptions } from '@/lib/website';

const TYPES = [
  { value: 'listing_tour', label: 'Listing tour' },
  { value: 'teaser_reel', label: 'Teaser reel' },
  { value: 'open_house_invite', label: 'Open house invite' },
  { value: 'agent_intro', label: 'Agent intro' },
  { value: 'market_update', label: 'Market update' },
];

const DURATIONS = [15, 30, 60];

const FORMATS = [
  { value: 'vertical', label: 'Vertical 9:16 (Reels)' },
  { value: 'square', label: 'Square 1:1' },
  { value: 'landscape', label: 'Landscape 16:9' },
];

export default function VideoRequestScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const clientId = profile?.client_id ?? null;
  const userId = session?.user.id ?? null;

  const [videoType, setVideoType] = useState('listing_tour');
  const [duration, setDuration] = useState(30);
  const [format, setFormat] = useState('vertical');
  const [listings, setListings] = useState<{ id: string; title: string }[]>([]);
  const [listingId, setListingId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchListingOptions().then(setListings);
  }, []);

  const submit = async () => {
    if (!clientId || !userId) {
      Alert.alert('Not ready', 'Your workspace is still being set up. Please try again shortly.');
      return;
    }
    setSaving(true);
    const { error } = await submitVideoRequest(clientId, userId, {
      video_type: videoType,
      duration_seconds: duration,
      format,
      listing_id: listingId,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not send', error);
      return;
    }
    Alert.alert(
      'Request sent 🎉',
      'The BaMo team will produce your video — you’ll see it in Social Media once it’s ready.',
      [{ text: 'Done', onPress: () => router.back() }],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={BrandColors.textHeading} />
        </Pressable>
        <Text style={styles.headerTitle}>Request a Video</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>Type of video</Text>
        <View style={styles.pillRow}>
          {TYPES.map((t) => (
            <TagPill key={t.value} label={t.label} active={videoType === t.value} onPress={() => setVideoType(t.value)} />
          ))}
        </View>

        <Text style={styles.section}>Duration</Text>
        <View style={styles.pillRow}>
          {DURATIONS.map((d) => (
            <TagPill key={d} label={`${d} seconds`} active={duration === d} onPress={() => setDuration(d)} />
          ))}
        </View>

        <Text style={styles.section}>Format</Text>
        <View style={styles.pillRow}>
          {FORMATS.map((f) => (
            <TagPill key={f.value} label={f.label} active={format === f.value} onPress={() => setFormat(f.value)} />
          ))}
        </View>

        {(videoType === 'listing_tour' || videoType === 'teaser_reel' || videoType === 'open_house_invite') && (
          <>
            <Text style={styles.section}>Link a listing</Text>
            {listings.length === 0 ? (
              <Text style={styles.muted}>
                No listings yet — post one in the Listings tab, or describe the property in the notes.
              </Text>
            ) : (
              <View style={styles.pillRow}>
                {listings.map((l) => (
                  <TagPill
                    key={l.id}
                    label={l.title || 'Untitled'}
                    active={listingId === l.id}
                    onPress={() => setListingId(listingId === l.id ? null : l.id)}
                  />
                ))}
              </View>
            )}
          </>
        )}

        <Text style={styles.section}>Notes</Text>
        <TextField
          label="Anything BaMo should know (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. highlight the pool and clubhouse, use the photos from my listing"
          multiline
          numberOfLines={3}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button label={saving ? 'Sending…' : 'Submit request'} onPress={submit} style={{ width: '100%' }} />
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
  muted: { ...TypeScale.body, color: BrandColors.textMuted },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
    backgroundColor: BrandColors.white,
  },
});
