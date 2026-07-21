import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import {
  AdPost,
  AdsPlanInfo,
  AutopostPlan,
  SocialPage,
  VideoRequest,
  approvePost,
  deactivateAutopost,
  fetchAdsPlan,
  fetchApprovals,
  fetchAutopostPlan,
  fetchPostHistory,
  fetchSocialPages,
  fetchUpcomingPosts,
  fetchVideoRequests,
  isPaidPlan,
  postDateLabel,
  skipPost,
  submitSubscriptionRequest,
  topicLabel,
} from '@/lib/social';

const VIDEO_TYPE_LABELS: Record<string, string> = {
  listing_tour: 'Listing tour',
  teaser_reel: 'Teaser reel',
  open_house_invite: 'Open house invite',
  agent_intro: 'Agent intro',
  market_update: 'Market update',
};

export default function SocialScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const clientId = profile?.client_id ?? null;
  const userId = session?.user.id ?? null;

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<AdsPlanInfo | null>(null);
  const [pages, setPages] = useState<SocialPage[]>([]);
  const [autopost, setAutopost] = useState<AutopostPlan | null>(null);
  const [approvals, setApprovals] = useState<AdPost[]>([]);
  const [upcoming, setUpcoming] = useState<AdPost[]>([]);
  const [history, setHistory] = useState<AdPost[]>([]);
  const [videos, setVideos] = useState<VideoRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, pg, ap, appr, up, hist, vids] = await Promise.all([
      fetchAdsPlan(),
      fetchSocialPages(),
      fetchAutopostPlan(),
      fetchApprovals(),
      fetchUpcomingPosts(),
      fetchPostHistory(),
      fetchVideoRequests(),
    ]);
    setPlan(p);
    setPages(pg);
    setAutopost(ap);
    setApprovals(appr);
    setUpcoming(up);
    setHistory(hist);
    setVideos(vids);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const fbPage = pages.find((p) => p.platform === 'facebook') ?? pages[0] ?? null;
  const activePlan = autopost && autopost.status === 'active' && new Date(autopost.ends_at).getTime() > Date.now()
    ? autopost
    : null;
  const daysLeft = activePlan
    ? Math.max(0, Math.ceil((new Date(activePlan.ends_at).getTime() - Date.now()) / 864e5))
    : 0;

  const requestPageConnection = async () => {
    if (!clientId || !userId) return;
    const { error } = await submitSubscriptionRequest(clientId, userId, 'fb_page_connection');
    if (error) Alert.alert('Could not send', error);
    else Alert.alert('Request sent', 'The BaMo team will reach out to connect your Facebook Page.');
  };

  const onApprove = async (post: AdPost) => {
    setBusyId(post.id);
    const { error } = await approvePost(post);
    setBusyId(null);
    if (error) Alert.alert('Could not approve', error);
    else {
      setApprovals((xs) => xs.filter((x) => x.id !== post.id));
      load();
    }
  };

  const onSkip = (post: AdPost) => {
    Alert.alert('Skip this post?', 'It will not be published.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Skip',
        style: 'destructive',
        onPress: async () => {
          setBusyId(post.id);
          const { error } = await skipPost(post.id);
          setBusyId(null);
          if (error) Alert.alert('Could not skip', error);
          else setApprovals((xs) => xs.filter((x) => x.id !== post.id));
        },
      },
    ]);
  };

  const onDeactivate = () => {
    if (!activePlan) return;
    Alert.alert('Deactivate auto-posting?', 'Upcoming BaMo posts will be cancelled.', [
      { text: 'Keep active', style: 'cancel' },
      {
        text: 'Deactivate',
        style: 'destructive',
        onPress: async () => {
          const { error } = await deactivateAutopost(activePlan.id);
          if (error) Alert.alert('Could not deactivate', error);
          else load();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <Screen title="Social Media">
        <ActivityIndicator color={BrandColors.navy} style={{ marginTop: 40 }} />
      </Screen>
    );
  }

  return (
    <Screen title="Social Media">
      {/* Facebook Page */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.rowStart}>
            <View style={styles.iconCircle}>
              <Ionicons name="logo-facebook" size={20} color={BrandColors.navy} />
            </View>
            <View>
              <Text style={styles.cardTitle}>Facebook Page</Text>
              {fbPage ? (
                <Text style={styles.cardSub}>{fbPage.account_name ?? 'Connected page'}</Text>
              ) : (
                <Text style={styles.cardSub}>No page connected yet</Text>
              )}
            </View>
          </View>
          {fbPage ? (
            <View style={[styles.dot, { backgroundColor: fbPage.is_active === false ? BrandColors.textMuted : BrandColors.success }]} />
          ) : null}
        </View>
        {!fbPage && (
          <Button label="Request connection" variant="secondary" small onPress={requestPageConnection} />
        )}
      </View>

      {/* Auto-Posting plan */}
      <View style={styles.card}>
        <View style={styles.rowStart}>
          <View style={styles.iconCircle}>
            <Ionicons name="sparkles-outline" size={20} color={BrandColors.orange} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>BaMo Auto-Posting</Text>
            <Text style={styles.cardSub}>3 posts a week — 1 static + 2 short videos, made for you</Text>
          </View>
        </View>

        {activePlan ? (
          <>
            <View style={styles.planRow}>
              <View style={styles.planStat}>
                <Text style={styles.planValue}>{daysLeft}</Text>
                <Text style={styles.planLabel}>days left</Text>
              </View>
              <View style={styles.planStat}>
                <Text style={styles.planValue}>{approvals.length}</Text>
                <Text style={styles.planLabel}>to approve</Text>
              </View>
              <View style={styles.planStat}>
                <Text style={styles.planValue}>{upcoming.length}</Text>
                <Text style={styles.planLabel}>scheduled</Text>
              </View>
            </View>
            <Text style={styles.topics}>
              Topics: {activePlan.weekly_topics.map((w) => topicLabel(w.topic)).join(' · ')}
            </Text>
            <Button label="Deactivate" variant="secondary" small onPress={onDeactivate} />
          </>
        ) : (
          <>
            {autopost && autopost.status !== 'cancelled' && (
              <Text style={styles.expired}>Your previous plan has ended — reactivate to keep posting.</Text>
            )}
            <Button
              label={isPaidPlan(plan) ? 'Activate auto-posting' : 'Activate'}
              onPress={() => router.push('/autopost-setup')}
            />
          </>
        )}
      </View>

      {/* Approvals */}
      {approvals.length > 0 && (
        <>
          <Text style={styles.section}>For your approval</Text>
          {approvals.map((post) => (
            <View key={post.id} style={styles.card}>
              <Text style={styles.postDate}>{postDateLabel(post.scheduled_at)}</Text>
              <Text style={styles.postMsg} numberOfLines={5}>
                {post.message ?? '(no caption yet)'}
              </Text>
              {busyId === post.id ? (
                <ActivityIndicator color={BrandColors.navy} />
              ) : (
                <View style={styles.rowButtons}>
                  <Button label="Approve" small onPress={() => onApprove(post)} style={{ flex: 1 }} />
                  <Button label="Skip" variant="secondary" small onPress={() => onSkip(post)} style={{ flex: 1 }} />
                </View>
              )}
            </View>
          ))}
        </>
      )}

      {/* Actions */}
      <View style={styles.rowButtons}>
        <Button label="Create a post" onPress={() => router.push('/post-compose')} style={{ flex: 1 }} />
        <Button
          label="Request a video"
          variant="secondary"
          onPress={() => router.push('/video-request')}
          style={{ flex: 1 }}
        />
      </View>

      {/* Upcoming */}
      <Text style={styles.section}>Upcoming</Text>
      {upcoming.length === 0 ? (
        <Text style={styles.muted}>No scheduled posts yet.</Text>
      ) : (
        upcoming.map((post) => (
          <View key={post.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.postDate}>{postDateLabel(post.scheduled_at)}</Text>
              <Text style={styles.badgeScheduled}>{post.source === 'autopost' ? 'BaMo' : 'You'}</Text>
            </View>
            <Text style={styles.postMsg} numberOfLines={3}>
              {post.message ?? ''}
            </Text>
          </View>
        ))
      )}

      {/* History */}
      <Text style={styles.section}>Recent</Text>
      {history.length === 0 ? (
        <Text style={styles.muted}>Published posts will show here.</Text>
      ) : (
        history.map((post) => (
          <View key={post.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.postDate}>{postDateLabel(post.published_at ?? post.created_at)}</Text>
              <Text style={post.status === 'published' ? styles.badgePublished : styles.badgeFailed}>
                {post.status === 'published' ? 'Published' : 'Failed'}
              </Text>
            </View>
            <Text style={styles.postMsg} numberOfLines={3}>
              {post.message ?? ''}
            </Text>
          </View>
        ))
      )}

      {/* Videos */}
      {videos.length > 0 && (
        <>
          <Text style={styles.section}>Your videos</Text>
          {videos.map((v) => (
            <View key={v.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>
                  {VIDEO_TYPE_LABELS[v.video_type] ?? v.video_type} · {v.duration_seconds}s
                </Text>
                <Text style={v.status === 'delivered' ? styles.badgePublished : styles.badgeScheduled}>
                  {v.status === 'delivered' ? 'Ready' : v.status === 'in_production' ? 'In production' : 'Requested'}
                </Text>
              </View>
              {v.status === 'delivered' && v.delivered_url ? (
                <Pressable onPress={() => Linking.openURL(v.delivered_url!)}>
                  <Text style={styles.link}>Watch / download</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 16,
    gap: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowStart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BrandColors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cardTitle: {
    ...TypeScale.h4,
    color: BrandColors.textHeading,
  },
  cardSub: {
    ...TypeScale.bodySmall,
    color: BrandColors.textBody,
  },
  section: {
    ...TypeScale.h4,
    color: BrandColors.textHeading,
    marginTop: 8,
  },
  muted: {
    ...TypeScale.body,
    color: BrandColors.textMuted,
  },
  planRow: {
    flexDirection: 'row',
    gap: 10,
  },
  planStat: {
    flex: 1,
    backgroundColor: BrandColors.cream100,
    borderRadius: Radii.button,
    paddingVertical: 10,
    alignItems: 'center',
  },
  planValue: {
    ...TypeScale.h3,
    color: BrandColors.navy,
  },
  planLabel: {
    ...TypeScale.labelSmall,
    color: BrandColors.textBody,
  },
  topics: {
    ...TypeScale.bodySmall,
    color: BrandColors.textBody,
  },
  expired: {
    ...TypeScale.bodySmall,
    color: BrandColors.error,
  },
  postDate: {
    ...TypeScale.label,
    color: BrandColors.navy,
  },
  postMsg: {
    ...TypeScale.body,
    color: BrandColors.textBody,
  },
  badgeScheduled: {
    ...TypeScale.labelSmall,
    color: BrandColors.navy,
    backgroundColor: BrandColors.cream200,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.pill,
    overflow: 'hidden',
  },
  badgePublished: {
    ...TypeScale.labelSmall,
    color: '#1E7B45',
    backgroundColor: '#E7F7EE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.pill,
    overflow: 'hidden',
  },
  badgeFailed: {
    ...TypeScale.labelSmall,
    color: BrandColors.error,
    backgroundColor: '#FDECEA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.pill,
    overflow: 'hidden',
  },
  link: {
    ...TypeScale.bodyBold,
    color: BrandColors.navy,
  },
});
