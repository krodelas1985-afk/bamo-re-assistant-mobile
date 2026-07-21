import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import {
  PageConnectionRequest,
  fetchLatestPageConnectionRequest,
} from '@/lib/page-connection';

/**
 * New-user funnel shown when a workspace has zero leads: connect the Facebook
 * Page (where leads come from), add one manually, and a teaser for the
 * self-serve BayMo Automations wizard (Phase 2).
 */
export function LeadsEmptyState({ pageConnected }: { pageConnected: boolean }) {
  const router = useRouter();
  const [request, setRequest] = useState<PageConnectionRequest | null>(null);

  useEffect(() => {
    if (!pageConnected) fetchLatestPageConnectionRequest().then(setRequest);
  }, [pageConnected]);

  const connectDone = pageConnected || request?.status === 'connected';
  const connectPending =
    !connectDone && (request?.status === 'pending' || request?.status === 'in_progress');

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Let&apos;s get your first leads in</Text>
      <Text style={styles.subtitle}>
        BayMo turns your Facebook Page messages into leads and answers them for you.
      </Text>

      <ActionCard
        icon="logo-facebook"
        iconColor={connectDone ? BrandColors.success : BrandColors.navy}
        title={
          connectDone
            ? 'Facebook Messenger connected'
            : connectPending
              ? 'Connecting your Facebook Page…'
              : 'Connect Facebook Messenger'
        }
        body={
          connectDone
            ? 'New messages on your Page become leads here automatically.'
            : connectPending
              ? 'Request received — tap to see the steps and status.'
              : 'This is where your leads come from. Takes a few minutes to set up.'
        }
        done={connectDone}
        onPress={() => router.push('/connect-page')}
      />

      <ActionCard
        icon="person-add-outline"
        iconColor={BrandColors.orange}
        title="Add a lead yourself"
        body="Already talking to a buyer? Add them so BayMo can help you track and follow up."
        onPress={() => router.push('/lead-new')}
      />

      <ActionCard
        icon="sparkles-outline"
        iconColor={BrandColors.navy}
        title="Set up BayMo Automations"
        body="Teach BayMo how to greet, qualify, and follow up with your leads."
        onPress={() => router.push('/automations')}
      />
    </View>
  );
}

function ActionCard({
  icon,
  iconColor,
  title,
  body,
  done,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  body: string;
  done?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={[styles.card, disabled && styles.cardDisabled]}
      onPress={onPress}
      disabled={disabled}>
      <View style={[styles.iconWrap, { backgroundColor: `${iconColor}18` }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.cardText}>
        <Text style={[styles.cardTitle, disabled && styles.mutedText]}>{title}</Text>
        <Text style={[styles.cardBody, disabled && styles.mutedText]}>{body}</Text>
      </View>
      {done ? (
        <Ionicons name="checkmark-circle" size={20} color={BrandColors.success} />
      ) : disabled ? null : (
        <Ionicons name="chevron-forward" size={18} color={BrandColors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingVertical: 16 },
  title: { ...TypeScale.h3, color: BrandColors.textHeading, textAlign: 'center' },
  subtitle: {
    ...TypeScale.body,
    color: BrandColors.textSecondary,
    textAlign: 'center',
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BrandColors.white,
    borderWidth: 1,
    borderColor: BrandColors.border,
    borderRadius: Radii.card,
    padding: 14,
  },
  cardDisabled: { opacity: 0.7 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { ...TypeScale.bodyBold, color: BrandColors.textHeading },
  cardBody: { ...TypeScale.bodySmall, color: BrandColors.textSecondary },
  mutedText: { color: BrandColors.textMuted },
});
