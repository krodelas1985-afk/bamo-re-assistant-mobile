import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { BrandColors, CardShadow, Radii, TypeScale } from '@/constants/brand';
import { useAuth } from '@/contexts/auth-context';
import {
  disconnectMetaConnection,
  fetchMetaConnection,
  startMetaConnection,
} from '@/lib/page-connection';
import type { MetaConnectionState } from '@/lib/page-connection';

const RETURN_URL = 'bamo://meta-connected';

export default function ConnectPageScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const canManage = profile?.role === 'client_admin';
  const [state, setState] = useState<MetaConnectionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!canManage) { setLoading(false); return; }
    try {
      setError(null);
      setState(await fetchMetaConnection());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check the connection.');
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const { login_url } = await startMetaConnection();
      const result = await WebBrowser.openAuthSessionAsync(login_url, RETURN_URL);
      if (result.type === 'success') {
        const resultUrl = new URL(result.url);
        if (resultUrl.searchParams.get('status') !== 'ok') {
          throw new Error(resultUrl.searchParams.get('message') || 'Facebook did not complete the connection.');
        }
        await refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect Facebook.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => Alert.alert(
    'Disconnect Facebook Page?',
    'BayMo will stop receiving new Messenger conversations from this Page.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive', onPress: async () => {
          setBusy(true);
          try { await disconnectMetaConnection(); await refresh(); }
          catch (err) { Alert.alert('Could not disconnect', err instanceof Error ? err.message : 'Please try again.'); }
          finally { setBusy(false); }
        },
      },
    ],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="close" size={26} color={BrandColors.textHeading} /></Pressable>
        <Text style={styles.headerTitle}>Facebook Messenger</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroIcon}><Ionicons name="logo-facebook" size={32} color={BrandColors.white} /></View>
        <Text style={styles.title}>Connect your Facebook Page</Text>
        <Text style={styles.lede}>New Page messages become leads in BayMo, where your team can reply and follow up.</Text>
        {loading ? <ActivityIndicator color={BrandColors.navy} style={styles.loader} /> : null}

        {!loading && !canManage ? (
          <View style={styles.notice}>
            <Ionicons name="lock-closed-outline" size={24} color={BrandColors.navy} />
            <Text style={styles.noticeTitle}>Workspace admin access needed</Text>
            <Text style={styles.centered}>Ask your workspace admin to connect the Facebook Page.</Text>
          </View>
        ) : null}

        {!loading && canManage && state?.connected ? (
          <View style={styles.statusCard}>
            <Ionicons name="checkmark-circle" size={36} color={BrandColors.success} />
            <Text style={styles.noticeTitle}>Connected</Text>
            <Text style={styles.pageName}>{state.page?.page_name}</Text>
            <Check label="Messenger access active" />
            <Check label="Webhook subscription verified" />
            <Check label="Page permissions granted" />
            {busy ? <ActivityIndicator color={BrandColors.navy} /> : <Button label="Disconnect Page" variant="secondary" onPress={disconnect} style={styles.fullWidth} />}
          </View>
        ) : null}

        {!loading && canManage && !state?.connected ? (
          <View style={styles.statusCard}>
            {state?.connection || state?.page ? (
              <>
                <Ionicons name="alert-circle-outline" size={34} color={BrandColors.orange} />
                <Text style={styles.noticeTitle}>Connection needs attention</Text>
                <Text style={styles.centered}>Reconnect to restore Messenger access.</Text>
              </>
            ) : null}
            <View style={styles.steps}>
              <Check label="Sign in securely with Facebook" />
              <Check label="Choose the Page you want to connect" />
              <Check label="Confirm access — usually under two minutes" />
            </View>
            <Text style={styles.privacy}>BayMo requests only the Page permissions needed for Messenger. Your Facebook password is never shared with BayMo.</Text>
            {busy ? <ActivityIndicator color={BrandColors.navy} /> : <Button label={state?.connection ? 'Reconnect Facebook' : 'Continue with Facebook'} onPress={connect} style={styles.fullWidth} />}
          </View>
        ) : null}

        {error ? (
          <Pressable style={styles.errorBox} onPress={() => void refresh()}>
            <Text style={styles.errorText}>{error}</Text><Text style={styles.retry}>Tap to try again</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Check({ label }: { label: string }) {
  return <View style={styles.checkRow}><Ionicons name="checkmark-circle" size={20} color={BrandColors.success} /><Text style={styles.checkText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BrandColors.screenBg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: BrandColors.white, borderBottomWidth: 1, borderBottomColor: BrandColors.border },
  headerTitle: { ...TypeScale.h4, color: BrandColors.textHeading },
  content: { padding: 20, alignItems: 'center', gap: 12, paddingBottom: 40 },
  heroIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#1877F2', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  title: { ...TypeScale.h2, color: BrandColors.textHeading, textAlign: 'center' },
  lede: { ...TypeScale.body, color: BrandColors.textSecondary, textAlign: 'center', maxWidth: 420 },
  loader: { marginVertical: 30 },
  notice: { width: '100%', alignItems: 'center', gap: 8, backgroundColor: BrandColors.white, ...CardShadow, borderRadius: Radii.card, padding: 20 },
  noticeTitle: { ...TypeScale.h4, color: BrandColors.textHeading, textAlign: 'center' },
  centered: { ...TypeScale.body, color: BrandColors.textSecondary, textAlign: 'center' },
  statusCard: { width: '100%', gap: 10, alignItems: 'center', backgroundColor: BrandColors.white, ...CardShadow, borderRadius: Radii.card, padding: 20, marginTop: 4 },
  pageName: { ...TypeScale.h3, color: BrandColors.navy, textAlign: 'center' },
  steps: { width: '100%', gap: 9, marginVertical: 4 },
  checkRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkText: { ...TypeScale.body, color: BrandColors.textBody, flex: 1 },
  privacy: { ...TypeScale.bodySmall, color: BrandColors.textMuted, textAlign: 'center' },
  fullWidth: { width: '100%' },
  errorBox: { width: '100%', borderWidth: 1, borderColor: BrandColors.error, borderRadius: Radii.chip, padding: 12, gap: 3 },
  errorText: { ...TypeScale.bodySmall, color: BrandColors.error, textAlign: 'center' },
  retry: { ...TypeScale.label, color: BrandColors.navy, textAlign: 'center' },
});
