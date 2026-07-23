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
import { TextField } from '@/components/ui/text-field';
import { BrandColors, CardShadow, Radii, TypeScale } from '@/constants/brand';
import { useAuth } from '@/contexts/auth-context';
import {
  PageConnectionRequest,
  fetchLatestPageConnectionRequest,
  submitPageConnectionRequest,
} from '@/lib/page-connection';

// The access steps matter: with standard Meta access, message webhooks are only
// delivered for Pages where BaMo's operator holds FULL Facebook access —
// partner/task access silently drops them.
const ACCESS_STEPS = [
  'Open your Facebook Page → Settings → Page setup → Add people.',
  'Add the BaMo team account and choose "Facebook access" with full control.',
  'Confirm the invite — we accept within the day.',
  'We wire your Page to BayMo and mark it connected here.',
];

export default function ConnectPageScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const clientId = profile?.client_id ?? null;
  const userId = session?.user.id ?? null;

  const [existing, setExisting] = useState<PageConnectionRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageName, setPageName] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLatestPageConnectionRequest().then((r) => {
      setExisting(r);
      setLoading(false);
    });
  }, []);

  const submit = async () => {
    if (!clientId || !userId) {
      Alert.alert('Not ready', 'Your workspace is still being set up. Please try again shortly.');
      return;
    }
    if (!pageName.trim()) {
      Alert.alert('Page name needed', 'Tell us the name of your Facebook Page.');
      return;
    }
    setSaving(true);
    const { error } = await submitPageConnectionRequest(clientId, userId, {
      pageName,
      pageUrl,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not send', error);
      return;
    }
    Alert.alert(
      'Request sent 🎉',
      'Follow the access steps on this screen — once we can see your Page, the BaMo team will connect it and let you know.',
      [{ text: 'Done', onPress: () => router.back() }],
    );
  };

  // A pending/in-progress/connected request replaces the form with its status.
  const showForm =
    !loading && (!existing || existing.status === 'rejected');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={BrandColors.textHeading} />
        </Pressable>
        <Text style={styles.headerTitle}>Connect Facebook Messenger</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.lede}>
          BayMo answers the people who message your Facebook Page — and turns them into leads
          here. Connecting your Page is how the leads start flowing.
        </Text>

        {loading ? (
          <ActivityIndicator color={BrandColors.navy} style={{ marginVertical: 24 }} />
        ) : existing && existing.status !== 'rejected' ? (
          <StatusCard request={existing} />
        ) : null}

        {existing?.status === 'rejected' && (
          <View style={[styles.statusCard, { borderColor: BrandColors.error }]}>
            <Text style={styles.statusTitle}>Previous request needs attention</Text>
            {!!existing.adminNotes && <Text style={styles.statusBody}>{existing.adminNotes}</Text>}
            <Text style={styles.statusBody}>You can send a new request below.</Text>
          </View>
        )}

        {showForm && (
          <>
            <Text style={styles.section}>Your Facebook Page</Text>
            <TextField
              label="Page name"
              value={pageName}
              onChangeText={setPageName}
              placeholder="e.g. Juan Dela Cruz Real Estate"
            />
            <TextField
              label="Page link (optional)"
              value={pageUrl}
              onChangeText={setPageUrl}
              placeholder="facebook.com/yourpage"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        )}

        <Text style={styles.section}>How connection works</Text>
        {ACCESS_STEPS.map((step, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
        <Text style={styles.muted}>
          Full access is required by Facebook for message delivery — BaMo only uses it to run
          BayMo on your Page.
        </Text>
      </ScrollView>

      {showForm && (
        <View style={styles.footer}>
          <Button
            label={saving ? 'Sending…' : 'Request connection'}
            onPress={submit}
            style={{ width: '100%' }}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function StatusCard({ request }: { request: PageConnectionRequest }) {
  const meta = {
    pending: {
      icon: 'time-outline' as const,
      color: BrandColors.orange,
      title: 'Request received',
      body: 'The BaMo team has been notified. Complete the access steps below so we can wire up your Page.',
    },
    in_progress: {
      icon: 'construct-outline' as const,
      color: BrandColors.navy,
      title: 'Connecting your Page…',
      body: 'We can see your Page and are wiring it to BayMo now.',
    },
    connected: {
      icon: 'checkmark-circle' as const,
      color: BrandColors.success,
      title: 'Connected!',
      body: 'BayMo is receiving messages from your Page. New leads will appear in your Leads tab.',
    },
  }[request.status as 'pending' | 'in_progress' | 'connected'];

  return (
    <View style={[styles.statusCard, { borderColor: meta.color }]}>
      <Ionicons name={meta.icon} size={28} color={meta.color} />
      <Text style={styles.statusTitle}>{meta.title}</Text>
      <Text style={styles.statusPage}>{request.pageName}</Text>
      <Text style={styles.statusBody}>{meta.body}</Text>
      {!!request.adminNotes && <Text style={styles.statusBody}>{request.adminNotes}</Text>}
    </View>
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
  lede: { ...TypeScale.body, color: BrandColors.textSecondary },
  section: { ...TypeScale.h4, color: BrandColors.textHeading, marginTop: 8 },
  muted: { ...TypeScale.bodySmall, color: BrandColors.textMuted, marginTop: 4 },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: BrandColors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { ...TypeScale.labelSmall, color: BrandColors.white },
  stepText: { ...TypeScale.body, color: BrandColors.textSecondary, flex: 1 },
  statusCard: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: BrandColors.white,
    ...CardShadow,
    borderWidth: 1.5,
    borderRadius: Radii.card,
    padding: 16,
    marginVertical: 6,
  },
  statusTitle: { ...TypeScale.h4, color: BrandColors.textHeading },
  statusPage: { ...TypeScale.bodyBold, color: BrandColors.navy },
  statusBody: { ...TypeScale.bodySmall, color: BrandColors.textSecondary, textAlign: 'center' },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
    backgroundColor: BrandColors.white,
  },
});
