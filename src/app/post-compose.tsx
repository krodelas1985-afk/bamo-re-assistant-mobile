import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TagPill } from '@/components/ui/tag-pill';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, CardShadow, Radii, TypeScale } from '@/constants/brand';
import {
  Creative,
  ReferenceDoc,
  createPost,
  fetchCreatives,
  fetchReferenceDocs,
  generatePostContent,
  uploadPostMedia,
} from '@/lib/social';
import { fetchListingOptions, fetchMyWebsite } from '@/lib/website';

const GOALS = [
  { value: 'listing_promotion', label: 'Promote a listing' },
  { value: 'open_house', label: 'Open house' },
  { value: 'tripping_invite', label: 'Tripping invite' },
  { value: 'real_estate_info', label: 'Real Estate Info' },
  { value: 'brand_awareness', label: 'Brand awareness' },
  { value: 'lead_magnet', label: 'Lead magnet' },
  { value: 'social_proof', label: 'Social proof' },
  { value: 'lifestyle', label: 'Lifestyle' },
];

const TONES = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'luxury', label: 'Luxury' },
];

const LANGUAGES = [
  { value: 'taglish', label: 'Taglish' },
  { value: 'english', label: 'English' },
  { value: 'tagalog', label: 'Tagalog' },
];

const MAX_PHOTOS = 10; // Facebook multi-photo post limit in the publisher
const MAX_REFERENCE_DOCS = 3;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/** One attached media item — either uploaded from the phone or a library creative. */
type MediaItem = {
  url: string;
  previewUrl: string;
  isVideo: boolean;
  creativeId: string | null;
};

function isoFromDateTime(date: string, time: string): string | null {
  const m = date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m || !t) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(t[1]),
    Number(t[2]),
  );
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function dateStr(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PostComposeScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const clientId = profile?.client_id ?? null;
  const userId = session?.user.id ?? null;

  // Agent signature (Agent Profile Phase 4) — optional block appended to the
  // caption on save, built from whatever profile fields are filled in.
  const signature = [
    [profile?.full_name, profile?.company].filter(Boolean).join(' · '),
    profile?.prc_number ? `PRC License No. ${profile.prc_number}` : '',
    [
      profile?.phone ? `📞 ${profile.phone}` : '',
      profile?.whatsapp ? `WhatsApp ${profile.whatsapp}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    profile?.service_area ? `📍 ${profile.service_area}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const [addSignature, setAddSignature] = useState(false);

  const [goal, setGoal] = useState('listing_promotion');
  const [tone, setTone] = useState('friendly');
  const [language, setLanguage] = useState('taglish');
  const [listings, setListings] = useState<{ id: string; title: string }[]>([]);
  const [listingId, setListingId] = useState<string | null>(null);
  const [instructions, setInstructions] = useState('');
  const [generating, setGenerating] = useState(false);

  // Reference grounding (mirrors the web Ads Manager)
  const [websiteUrl, setWebsiteUrl] = useState<string | null>(null);
  const [referenceUrl, setReferenceUrl] = useState('');
  const [refDocs, setRefDocs] = useState<ReferenceDoc[]>([]);
  const [refDocIds, setRefDocIds] = useState<string[]>([]);

  // Attached media
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [creativesOpen, setCreativesOpen] = useState(false);

  const [message, setMessage] = useState('');
  const [schedule, setSchedule] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchListingOptions().then(setListings);
    fetchReferenceDocs().then(setRefDocs);
    fetchCreatives().then(setCreatives);
    fetchMyWebsite().then(({ data }) => {
      if (data?.status === 'live' && data.website_url) setWebsiteUrl(data.website_url);
    });
  }, []);

  const hasVideo = media.some((m) => m.isVideo);

  const canAdd = (item: { isVideo: boolean }): string | null => {
    if (item.isVideo && media.length > 0) return 'A video post can only have the one video — remove the other media first.';
    if (!item.isVideo && hasVideo) return 'A video post can only have the one video. Remove it to add photos.';
    if (!item.isVideo && media.length >= MAX_PHOTOS) return `Up to ${MAX_PHOTOS} photos per post.`;
    return null;
  };

  const pickFromPhone = async () => {
    if (!clientId) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS,
      quality: 0.7,
      base64: false,
    });
    if (res.canceled) return;
    setUploading(true);
    for (const a of res.assets) {
      const isVideo = a.type === 'video';
      const blockReason = canAdd({ isVideo });
      if (blockReason) {
        Alert.alert('Cannot add', blockReason);
        break;
      }
      if (isVideo && a.fileSize && a.fileSize > MAX_VIDEO_BYTES) {
        Alert.alert('Video too large', 'Please choose a video under 100 MB.');
        continue;
      }
      const { url, error } = await uploadPostMedia(clientId, {
        uri: a.uri,
        mimeType: a.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
      });
      if (error || !url) {
        Alert.alert('Upload failed', error ?? 'Please try again.');
        break;
      }
      setMedia((xs) => [...xs, { url, previewUrl: a.uri, isVideo, creativeId: null }]);
    }
    setUploading(false);
  };

  const toggleCreative = (c: Creative) => {
    const existing = media.find((m) => m.creativeId === c.id);
    if (existing) {
      setMedia((xs) => xs.filter((m) => m.creativeId !== c.id));
      return;
    }
    const isVideo = c.creative_type === 'video';
    const blockReason = canAdd({ isVideo });
    if (blockReason) {
      Alert.alert('Cannot add', blockReason);
      return;
    }
    setMedia((xs) => [
      ...xs,
      { url: c.asset_url, previewUrl: c.thumbnail_url ?? c.asset_url, isVideo, creativeId: c.id },
    ]);
  };

  const removeMedia = (url: string) => {
    setMedia((xs) => xs.filter((m) => m.url !== url));
  };

  const toggleRefDoc = (id: string) => {
    setRefDocIds((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (ids.length >= MAX_REFERENCE_DOCS) {
        Alert.alert('Up to 3 documents', 'You can reference at most 3 documents per generation.');
        return ids;
      }
      return [...ids, id];
    });
  };

  const generate = async () => {
    setGenerating(true);
    const { data, error } = await generatePostContent({
      goal,
      tone,
      language,
      listing_id: listingId,
      instructions: instructions.trim() || null,
      reference_url: referenceUrl.trim() || null,
      reference_document_ids: refDocIds,
    });
    setGenerating(false);
    if (error || !data) {
      Alert.alert('Generation failed', error ?? 'Please try again.');
      return;
    }
    const hashtags = data.hashtags?.length ? `\n\n${data.hashtags.join(' ')}` : '';
    setMessage(`${data.caption}${hashtags}`);
    if (data.warning) Alert.alert('Heads up', data.warning);
  };

  const save = async (action: 'draft' | 'schedule') => {
    if (!clientId || !userId) {
      Alert.alert('Not ready', 'Your workspace is still being set up. Please try again shortly.');
      return;
    }
    if (!message.trim()) {
      Alert.alert('Empty post', 'Write or generate a caption first.');
      return;
    }
    let scheduledAt: string | null = null;
    if (action === 'schedule') {
      scheduledAt = isoFromDateTime(date, time);
      if (!scheduledAt) {
        Alert.alert('Set a schedule', 'Enter the date as YYYY-MM-DD and time as HH:MM (24h).');
        return;
      }
    }
    // A lone creative goes as creative_id so the publisher resolves its true
    // photo/video type; anything else goes as explicit media_urls.
    const loneCreative = media.length === 1 && media[0].creativeId ? media[0].creativeId : null;
    setSaving(true);
    const { error } = await createPost(clientId, userId, {
      message: addSignature && signature ? `${message.trim()}\n\n${signature}` : message.trim(),
      action,
      scheduled_at: scheduledAt,
      media_urls: loneCreative ? [] : media.map((m) => m.url),
      creative_id: loneCreative,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error);
      return;
    }
    Alert.alert(
      action === 'schedule' ? 'Post scheduled 🎉' : 'Draft saved',
      action === 'schedule'
        ? 'BaMo will publish it to your Facebook Page at the scheduled time.'
        : 'You can find it in your posts — schedule it anytime.',
      [{ text: 'Done', onPress: () => router.back() }],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={BrandColors.textHeading} />
        </Pressable>
        <Text style={styles.headerTitle}>Create a Post</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* AI generator */}
        <View style={styles.aiCard}>
          <View style={styles.aiHeader}>
            <Ionicons name="sparkles" size={18} color={BrandColors.orange} />
            <Text style={styles.aiTitle}>Ask BayMo to write it</Text>
          </View>

          <Text style={styles.label}>Goal</Text>
          <View style={styles.pillRow}>
            {GOALS.map((g) => (
              <TagPill key={g.value} label={g.label} active={goal === g.value} onPress={() => setGoal(g.value)} />
            ))}
          </View>

          <Text style={styles.label}>Tone</Text>
          <View style={styles.pillRow}>
            {TONES.map((t) => (
              <TagPill key={t.value} label={t.label} active={tone === t.value} onPress={() => setTone(t.value)} />
            ))}
          </View>

          <Text style={styles.label}>Language</Text>
          <View style={styles.pillRow}>
            {LANGUAGES.map((l) => (
              <TagPill key={l.value} label={l.label} active={language === l.value} onPress={() => setLanguage(l.value)} />
            ))}
          </View>

          {listings.length > 0 && (
            <>
              <Text style={styles.label}>Link a listing (optional)</Text>
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
            </>
          )}

          {/* Reference grounding */}
          {refDocs.length > 0 && (
            <>
              <Text style={styles.label}>Reference documents (optional, up to 3)</Text>
              <View style={styles.pillRow}>
                {refDocs.map((d) => (
                  <TagPill
                    key={d.id}
                    label={d.filename}
                    active={refDocIds.includes(d.id)}
                    onPress={() => toggleRefDoc(d.id)}
                  />
                ))}
              </View>
            </>
          )}

          <TextField
            label="Reference webpage (optional)"
            value={referenceUrl}
            onChangeText={setReferenceUrl}
            placeholder="https:// — BayMo will use facts from this page"
            autoCapitalize="none"
          />
          {websiteUrl && (
            <View style={styles.pillRow}>
              <TagPill
                label="Use my website"
                active={referenceUrl === websiteUrl}
                onPress={() => setReferenceUrl(referenceUrl === websiteUrl ? '' : websiteUrl)}
              />
            </View>
          )}

          <TextField
            label="Instructions (optional)"
            value={instructions}
            onChangeText={setInstructions}
            placeholder="e.g. mention the 20% promo, target OFW buyers"
            multiline
            numberOfLines={2}
          />

          {generating ? (
            <ActivityIndicator color={BrandColors.navy} />
          ) : (
            <Button label="✨ Generate caption" variant="secondary" onPress={generate} />
          )}
        </View>

        {/* Caption */}
        <TextField
          label="Post caption"
          value={message}
          onChangeText={setMessage}
          placeholder="Write your post, or generate one above…"
          multiline
          numberOfLines={8}
        />

        {/* Agent signature */}
        {signature ? (
          <View style={styles.signatureCard}>
            <View style={styles.signatureRow}>
              <View style={styles.signatureText}>
                <Text style={styles.signatureTitle}>Add my signature</Text>
                <Text style={styles.signatureHint}>Appends your contact details to the post</Text>
              </View>
              <Switch
                value={addSignature}
                onValueChange={setAddSignature}
                trackColor={{ true: BrandColors.orange, false: BrandColors.borderDark }}
                thumbColor={BrandColors.white}
              />
            </View>
            {addSignature ? <Text style={styles.signaturePreview}>{signature}</Text> : null}
          </View>
        ) : null}

        {/* Media */}
        <Text style={styles.mediaTitle}>Photos & video</Text>
        <Text style={styles.mediaHint}>Add up to {MAX_PHOTOS} photos, or 1 video.</Text>
        {media.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaRow}>
            {media.map((m) => (
              <View key={m.url} style={styles.mediaThumbWrap}>
                <Image source={{ uri: m.previewUrl }} style={styles.mediaThumb} contentFit="cover" />
                {m.isVideo && (
                  <View style={styles.videoBadge}>
                    <Ionicons name="videocam" size={14} color={BrandColors.white} />
                  </View>
                )}
                <Pressable style={styles.removeBtn} hitSlop={8} onPress={() => removeMedia(m.url)}>
                  <Ionicons name="close" size={14} color={BrandColors.white} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
        {uploading ? (
          <ActivityIndicator color={BrandColors.navy} />
        ) : (
          <View style={styles.rowButtons}>
            <Button label="From phone" variant="secondary" small onPress={pickFromPhone} style={{ flex: 1 }} />
            <Button
              label="My creatives"
              variant="secondary"
              small
              onPress={() => {
                if (creatives.length === 0) {
                  Alert.alert('No creatives yet', 'Creatives made for you by BaMo will show up here.');
                  return;
                }
                setCreativesOpen(true);
              }}
              style={{ flex: 1 }}
            />
          </View>
        )}

        {/* Schedule */}
        <Pressable style={styles.scheduleToggle} onPress={() => setSchedule(!schedule)}>
          <Ionicons
            name={schedule ? 'checkbox' : 'square-outline'}
            size={22}
            color={schedule ? BrandColors.orange : BrandColors.textMuted}
          />
          <Text style={styles.scheduleText}>Schedule this post</Text>
        </Pressable>

        {schedule && (
          <>
            <View style={styles.pillRow}>
              <TagPill label="Today" active={date === dateStr(0)} onPress={() => setDate(dateStr(0))} />
              <TagPill label="Tomorrow" active={date === dateStr(1)} onPress={() => setDate(dateStr(1))} />
            </View>
            <TextField label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
            <TextField label="Time (24h)" value={time} onChangeText={setTime} placeholder="e.g. 18:30" autoCapitalize="none" />
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={saving ? 'Saving…' : schedule ? 'Schedule post' : 'Save draft'}
          onPress={() => save(schedule ? 'schedule' : 'draft')}
          style={{ flex: 1 }}
        />
      </View>

      {/* Creatives picker */}
      <Modal visible={creativesOpen} animationType="slide" onRequestClose={() => setCreativesOpen(false)}>
        <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
          <View style={styles.header}>
            <Pressable onPress={() => setCreativesOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={26} color={BrandColors.textHeading} />
            </Pressable>
            <Text style={styles.headerTitle}>My Creatives</Text>
            <View style={{ width: 26 }} />
          </View>
          <ScrollView contentContainerStyle={styles.grid}>
            {creatives.map((c) => {
              const selected = media.some((m) => m.creativeId === c.id);
              return (
                <Pressable key={c.id} style={styles.gridItem} onPress={() => toggleCreative(c)}>
                  <Image
                    source={{ uri: c.thumbnail_url ?? c.asset_url }}
                    style={[styles.gridImage, selected && styles.gridImageSelected]}
                    contentFit="cover"
                  />
                  {c.creative_type === 'video' && (
                    <View style={styles.videoBadge}>
                      <Ionicons name="videocam" size={14} color={BrandColors.white} />
                    </View>
                  )}
                  {selected && (
                    <View style={styles.checkBadge}>
                      <Ionicons name="checkmark" size={16} color={BrandColors.white} />
                    </View>
                  )}
                  {c.original_filename ? (
                    <Text style={styles.gridLabel} numberOfLines={1}>
                      {c.original_filename}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.footer}>
            <Button label="Done" onPress={() => setCreativesOpen(false)} style={{ flex: 1 }} />
          </View>
        </SafeAreaView>
      </Modal>
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
  aiCard: {
    backgroundColor: BrandColors.cream50,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: BrandColors.cream400,
    padding: 14,
    gap: 8,
  },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiTitle: { ...TypeScale.h4, color: BrandColors.textHeading },
  label: { ...TypeScale.label, color: BrandColors.textSecondary, marginTop: 4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowButtons: { flexDirection: 'row', gap: 10 },
  signatureCard: {
    backgroundColor: BrandColors.white,
    ...CardShadow,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: BrandColors.border,
    padding: 12,
    gap: 8,
  },
  signatureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  signatureText: { flex: 1, gap: 1 },
  signatureTitle: { ...TypeScale.bodyBold, color: BrandColors.textHeading },
  signatureHint: { ...TypeScale.bodySmall, color: BrandColors.textMuted },
  signaturePreview: {
    ...TypeScale.bodySmall,
    color: BrandColors.textBody,
    backgroundColor: BrandColors.cream50,
    borderRadius: Radii.button,
    padding: 10,
  },
  mediaTitle: { ...TypeScale.h4, color: BrandColors.textHeading, marginTop: 4 },
  mediaHint: { ...TypeScale.bodySmall, color: BrandColors.textMuted },
  mediaRow: { gap: 8, paddingVertical: 4 },
  mediaThumbWrap: { position: 'relative' },
  mediaThumb: {
    width: 84,
    height: 84,
    borderRadius: Radii.button,
    backgroundColor: BrandColors.cream200,
  },
  videoBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  scheduleText: { ...TypeScale.body, color: BrandColors.textHeading },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
    backgroundColor: BrandColors.white,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 16,
  },
  gridItem: { width: '30.5%', position: 'relative' },
  gridImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radii.button,
    backgroundColor: BrandColors.cream200,
  },
  gridImageSelected: {
    borderWidth: 3,
    borderColor: BrandColors.orange,
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: BrandColors.orange,
    borderRadius: 11,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLabel: { ...TypeScale.labelSmall, color: BrandColors.textBody, marginTop: 4 },
});
