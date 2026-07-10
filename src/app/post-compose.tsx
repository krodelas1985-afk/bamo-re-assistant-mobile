import { Ionicons } from '@expo/vector-icons';
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
import { useUsage } from '@/hooks/use-usage';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import { createPost, generatePostContent } from '@/lib/social';
import { atLimit } from '@/lib/usage';
import { fetchListingOptions } from '@/lib/website';

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
  const { usage } = useUsage();
  const clientId = profile?.client_id ?? null;
  const userId = session?.user.id ?? null;
  const aiFull = atLimit(usage?.ai);

  const [goal, setGoal] = useState('listing_promotion');
  const [tone, setTone] = useState('friendly');
  const [language, setLanguage] = useState('taglish');
  const [listings, setListings] = useState<{ id: string; title: string }[]>([]);
  const [listingId, setListingId] = useState<string | null>(null);
  const [instructions, setInstructions] = useState('');
  const [generating, setGenerating] = useState(false);

  const [message, setMessage] = useState('');
  const [schedule, setSchedule] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchListingOptions().then(setListings);
  }, []);

  const generate = async () => {
    setGenerating(true);
    const { data, error } = await generatePostContent({
      goal,
      tone,
      language,
      listing_id: listingId,
      instructions: instructions.trim() || null,
    });
    setGenerating(false);
    if (error || !data) {
      Alert.alert('Generation failed', error ?? 'Please try again.');
      return;
    }
    const hashtags = data.hashtags?.length ? `\n\n${data.hashtags.join(' ')}` : '';
    setMessage(`${data.caption}${hashtags}`);
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
    setSaving(true);
    const { error } = await createPost(clientId, userId, {
      message: message.trim(),
      action,
      scheduled_at: scheduledAt,
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
            <Button
              label={aiFull ? 'Monthly AI limit reached' : '✨ Generate caption'}
              variant="secondary"
              onPress={generate}
              disabled={aiFull}
            />
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
});
