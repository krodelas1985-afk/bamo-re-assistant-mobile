import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import { Website, fetchMyWebsite, fileWebsiteRequest } from '@/lib/website';

export default function WebsiteScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const clientId = profile?.client_id ?? null;

  const [site, setSite] = useState<Website | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [modifyNote, setModifyNote] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Race against a timeout so the screen can never spin forever if the
      // request stalls (e.g. flaky mobile data) — the user always gets a retry.
      const result = await Promise.race([
        fetchMyWebsite(),
        new Promise<{ data: Website | null; error: string }>((resolve) =>
          setTimeout(
            () =>
              resolve({
                data: null,
                error: 'This is taking longer than usual. Check your connection and try again.',
              }),
            12000,
          ),
        ),
      ]);
      if (result.error) setError(result.error);
      else setSite(result.data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const sendModify = async () => {
    if (!site || !clientId || !session?.user) return;
    if (!modifyNote.trim()) {
      Alert.alert('What should we change?', 'Add a short note describing the changes you want.');
      return;
    }
    setSending(true);
    const { error: e } = await fileWebsiteRequest(
      clientId,
      session.user.id,
      site.id,
      'modify',
      modifyNote.trim(),
    );
    setSending(false);
    if (e) {
      Alert.alert('Could not send', e);
      return;
    }
    setModifyOpen(false);
    setModifyNote('');
    Alert.alert('Request sent', 'Thanks! We’ll update your website and notify you when it’s done.');
  };

  const confirmDelete = () => {
    if (!site || !clientId || !session?.user) return;
    Alert.alert(
      'Delete website?',
      'This sends a request for BaMo to take your website down. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request deletion',
          style: 'destructive',
          onPress: async () => {
            const { error: e } = await fileWebsiteRequest(
              clientId,
              session.user.id,
              site.id,
              'delete',
              null,
            );
            if (e) Alert.alert('Could not send', e);
            else Alert.alert('Request sent', 'We’ll take your website down and confirm shortly.');
          },
        },
      ],
    );
  };

  const shareSite = async () => {
    if (!site?.website_url) return;
    try {
      await Share.share({ message: `Check out my website: ${site.website_url}`, url: site.website_url });
    } catch {
      /* user dismissed */
    }
  };

  return (
    <Screen title="My Website" onBack={() => router.back()}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.navy} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Couldn’t load your website.</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <Button label="Try again" small onPress={load} style={{ marginTop: 4 }} />
        </View>
      ) : !site ? (
        <EmptyState onCreate={() => router.push('/website-request')} />
      ) : site.status === 'live' ? (
        <LiveState
          site={site}
          onVisit={() => site.website_url && Linking.openURL(site.website_url)}
          onCopyOrShare={shareSite}
          onModify={() => setModifyOpen(true)}
          onDelete={confirmDelete}
        />
      ) : (
        <PendingState site={site} />
      )}

      {/* Modify-request modal */}
      <Modal visible={modifyOpen} transparent animationType="fade" onRequestClose={() => setModifyOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Request changes</Text>
            <Text style={styles.modalSub}>Tell us what you’d like updated on your website.</Text>
            <TextField
              label="Changes"
              value={modifyNote}
              onChangeText={setModifyNote}
              placeholder="e.g. Update my phone number and add my new Ayala Westgrove listing"
              multiline
              numberOfLines={4}
            />
            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => setModifyOpen(false)}
                style={styles.flexBtn}
              />
              <Button
                label={sending ? 'Sending…' : 'Send request'}
                onPress={sendModify}
                style={styles.flexBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

// ── State A: no website yet ───────────────────────────────────────────────
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.heroIcon}>
        <Ionicons name="globe-outline" size={34} color={BrandColors.navy} />
      </View>
      <Text style={styles.cardTitle}>Get your own agent website</Text>
      <Text style={styles.cardBody}>
        A professional website with your listings, branding, and contact details — built for you by
        BaMo. Send a request and we’ll take it from there.
      </Text>
      <Button label="Create my Website" onPress={onCreate} style={{ width: '100%', marginTop: 4 }} />
    </View>
  );
}

// ── State B: requested / building ─────────────────────────────────────────
function PendingState({ site }: { site: Website }) {
  return (
    <>
      <View style={styles.card}>
        <View style={[styles.heroIcon, { backgroundColor: BrandColors.cream200 }]}>
          <Ionicons name="construct-outline" size={30} color={BrandColors.orangeDark} />
        </View>
        <Text style={styles.cardTitle}>We’re building your website</Text>
        <Text style={styles.cardBody}>
          Thank you for sending your request — we’ll notify you when your website is ready.
        </Text>
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>
            {site.status === 'building' ? 'In progress' : 'Request received'}
          </Text>
        </View>
      </View>

      <Text style={styles.section}>What you submitted</Text>
      <View style={styles.card}>
        {site.hero_photo_url ? (
          <Image source={{ uri: site.hero_photo_url }} style={styles.heroThumb} contentFit="cover" />
        ) : null}
        <SummaryRow label="Agent" value={site.agent_name} />
        <SummaryRow label="Area coverage" value={site.area_coverage} />
        <SummaryRow label="Company" value={site.company} />
        <SummaryRow
          label="Linked listings"
          value={site.linked_listing_ids.length ? `${site.linked_listing_ids.length} selected` : null}
        />
        <SummaryRow label="Assets folder" value={site.assets_drive_url ? 'Provided' : null} />
      </View>
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value || '—'}</Text>
    </View>
  );
}

// ── State C: live ─────────────────────────────────────────────────────────
function LiveState({
  site,
  onVisit,
  onCopyOrShare,
  onModify,
  onDelete,
}: {
  site: Website;
  onVisit: () => void;
  onCopyOrShare: () => void;
  onModify: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <View style={styles.card}>
        {site.hero_photo_url ? (
          <Image source={{ uri: site.hero_photo_url }} style={styles.heroThumb} contentFit="cover" />
        ) : null}
        <View style={styles.liveBadge}>
          <View style={[styles.statusDot, { backgroundColor: BrandColors.success }]} />
          <Text style={[styles.statusText, { color: BrandColors.success }]}>Live</Text>
        </View>
        <Text style={styles.cardTitle}>Your website is live 🎉</Text>
        {site.website_url ? (
          <Pressable onPress={onVisit}>
            <Text style={styles.link} numberOfLines={1}>
              {site.website_url}
            </Text>
          </Pressable>
        ) : null}
        <Button label="Visit Website" onPress={onVisit} style={{ width: '100%', marginTop: 8 }} />
      </View>

      <ActionRow icon="share-social-outline" label="Share website" onPress={onCopyOrShare} />
      <ActionRow icon="create-outline" label="Request to modify" onPress={onModify} />
      <ActionRow icon="trash-outline" label="Delete website" onPress={onDelete} danger />
    </>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  danger = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const color = danger ? BrandColors.error : BrandColors.navy;
  return (
    <Pressable style={styles.actionRow} onPress={onPress}>
      <View style={[styles.actionIcon, danger && { backgroundColor: '#FDECEA' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.actionLabel, danger && { color: BrandColors.error }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={BrandColors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { ...TypeScale.body, color: BrandColors.textSecondary, textAlign: 'center', paddingHorizontal: 24 },
  errorDetail: { ...TypeScale.bodySmall, color: BrandColors.textMuted, textAlign: 'center', paddingHorizontal: 24 },
  card: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 20,
    gap: 10,
    alignItems: 'center',
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: BrandColors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { ...TypeScale.h3, color: BrandColors.textHeading, textAlign: 'center' },
  cardBody: { ...TypeScale.body, color: BrandColors.textBody, textAlign: 'center' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BrandColors.cream100,
    borderRadius: Radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 4,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BrandColors.orange },
  statusText: { ...TypeScale.label, color: BrandColors.orangeDark },
  section: { ...TypeScale.h4, color: BrandColors.textHeading, marginTop: 4, alignSelf: 'flex-start' },
  heroThumb: {
    width: '100%',
    height: 150,
    borderRadius: Radii.button,
    backgroundColor: BrandColors.cream300,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    gap: 12,
    paddingVertical: 4,
  },
  summaryLabel: { ...TypeScale.label, color: BrandColors.textSecondary },
  summaryValue: { ...TypeScale.body, color: BrandColors.textHeading, flexShrink: 1, textAlign: 'right' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  link: { ...TypeScale.body, color: BrandColors.navy, textDecorationLine: 'underline' },
  actionRow: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BrandColors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { ...TypeScale.h4, color: BrandColors.textHeading, flex: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { backgroundColor: BrandColors.white, borderRadius: Radii.card, padding: 20, gap: 10 },
  modalTitle: { ...TypeScale.h3, color: BrandColors.textHeading },
  modalSub: { ...TypeScale.body, color: BrandColors.textBody },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  flexBtn: { flex: 1 },
});
