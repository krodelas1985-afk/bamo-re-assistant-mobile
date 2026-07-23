import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, CardShadow, Radii, TypeScale } from '@/constants/brand';
import { relativeTime } from '@/lib/leads';
import {
  AdAccountStatus,
  AdNotification,
  AdReport,
  Campaign,
  PerformanceSnapshot,
  fetchAdAccountStatus,
  fetchCampaigns,
  fetchLatestReport,
  fetchNotifications,
  fetchPerformanceSnapshot,
  isAdsGateOpen,
  markNotificationRead,
  money,
  submitAdAccountSetupRequest,
  verdictMeta,
} from '@/lib/ads';

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Active', color: '#1E7B45', bg: '#E7F7EE' },
  paused: { label: 'Paused', color: '#854F0B', bg: '#FDF2E6' },
  completed: { label: 'Completed', color: '#0F172A', bg: '#E8EBF3' },
  draft: { label: 'Draft', color: '#5B5B5B', bg: '#F1EFE8' },
  failed: { label: 'Failed', color: '#E74C3C', bg: '#FDECEA' },
};

export default function AdsScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const clientId = profile?.client_id ?? null;
  const userId = session?.user.id ?? null;

  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<AdAccountStatus | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [snapshot, setSnapshot] = useState<PerformanceSnapshot | null>(null);
  const [report, setReport] = useState<AdReport | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [notifications, setNotifications] = useState<AdNotification[]>([]);
  const [selectedNotif, setSelectedNotif] = useState<AdNotification | null>(null);

  const load = useCallback(async () => {
    const acct = await fetchAdAccountStatus();
    setAccount(acct);
    if (isAdsGateOpen(acct)) {
      const [snap, rep, camps, notifs] = await Promise.all([
        fetchPerformanceSnapshot(),
        fetchLatestReport(),
        fetchCampaigns(),
        fetchNotifications(),
      ]);
      setSnapshot(snap);
      setReport(rep);
      setCampaigns(camps);
      setNotifications(notifs);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const requestSetup = async () => {
    if (!clientId || !userId) return;
    setRequesting(true);
    const { error } = await submitAdAccountSetupRequest(clientId, userId);
    setRequesting(false);
    if (error) Alert.alert('Could not send', error);
    else setRequested(true);
  };

  const onOpenNotif = async (n: AdNotification) => {
    setSelectedNotif(n);
    if (!n.is_read) {
      setNotifications((xs) => xs.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      await markNotificationRead(n.id);
    }
  };

  const onDismissNotif = async (id: string) => {
    setSelectedNotif(null);
    setNotifications((xs) => xs.filter((n) => n.id !== id));
    await markNotificationRead(id);
  };

  if (loading) {
    return (
      <Screen title="Ads Management" onBack={() => router.back()}>
        <ActivityIndicator color={BrandColors.navy} style={{ marginTop: 40 }} />
      </Screen>
    );
  }

  if (!isAdsGateOpen(account)) {
    return (
      <Screen title="Ads Management" onBack={() => router.back()}>
        <View style={styles.gate}>
          <View style={styles.gateIcon}>
            <Ionicons name="megaphone-outline" size={30} color={BrandColors.orange} />
          </View>
          <Text style={styles.gateTitle}>BaMo isn’t running ads for you yet</Text>
          <Text style={styles.gateBody}>
            Once your Meta ad account is set up, you’ll see your campaign performance, a weekly
            AI report, and can request new campaigns right here.
          </Text>
          {requested ? (
            <Text style={styles.gateSent}>Request sent ✔ The BaMo team will reach out to set it up.</Text>
          ) : (
            <Button label={requesting ? 'Sending…' : 'Request setup'} onPress={requestSetup} style={{ alignSelf: 'stretch' }} />
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Ads Management" onBack={() => router.back()}>
      {/* Performance snapshot */}
      {snapshot && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Last 7 days</Text>
          <View style={styles.statGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{money(snapshot.spend)}</Text>
              <Text style={styles.statLabel}>Spend</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{snapshot.leads}</Text>
              <Text style={styles.statLabel}>Leads</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{snapshot.ctr.toFixed(1)}%</Text>
              <Text style={styles.statLabel}>CTR</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{snapshot.cpl ? money(snapshot.cpl) : '—'}</Text>
              <Text style={styles.statLabel}>Cost/lead</Text>
            </View>
          </View>
        </View>
      )}

      {/* AI Weekly Report */}
      {report && report.status === 'completed' && (
        <View style={styles.card}>
          <View style={styles.rowStart}>
            <Ionicons name="sparkles" size={18} color={BrandColors.orange} />
            <Text style={styles.cardTitle}>BaMo's weekly take</Text>
          </View>
          <Text style={styles.summary}>{report.summary}</Text>
          {(report.verdicts ?? []).map((v) => {
            const meta = verdictMeta(v.verdict);
            return (
              <View key={v.meta_ad_id} style={styles.verdictRow}>
                <View style={[styles.verdictBadge, { backgroundColor: meta.color + '22' }]}>
                  <Text style={[styles.verdictText, { color: meta.color }]}>{meta.label}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.verdictName} numberOfLines={1}>{v.ad_name}</Text>
                  <Text style={styles.verdictReason}>{v.suggested_fix}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
      {report && report.status === 'no_data' && (
        <Text style={styles.muted}>No ad activity recorded yet this week.</Text>
      )}

      <Button label="Request a campaign" onPress={() => router.push('/campaign-request')} />

      {/* Campaign list */}
      <Text style={styles.section}>Campaigns</Text>
      {campaigns.length === 0 ? (
        <Text style={styles.muted}>No campaigns yet.</Text>
      ) : (
        campaigns.map((c) => {
          const meta = STATUS_META[c.status] ?? STATUS_META.draft;
          return (
            <View key={c.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.campaignName} numberOfLines={1}>{c.name}</Text>
                <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
              {c.budget_daily ? (
                <Text style={styles.campaignSub}>{money(Number(c.budget_daily))}/day</Text>
              ) : null}
            </View>
          );
        })
      )}

      {/* Notifications */}
      {notifications.length > 0 && (
        <>
          <Text style={styles.section}>Notifications</Text>
          {notifications.map((n) => (
            <Pressable key={n.id} style={styles.card} onPress={() => onOpenNotif(n)}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{n.title}</Text>
                {!n.is_read && <View style={styles.unreadDot} />}
              </View>
              <Text style={styles.campaignSub} numberOfLines={2}>{n.message}</Text>
              <View style={styles.rowStart}>
                <Text style={styles.notifHint}>Tap to see the numbers</Text>
                <Ionicons name="chevron-forward" size={13} color={BrandColors.orange} />
              </View>
            </Pressable>
          ))}
        </>
      )}

      {/* Notification detail — shows the actual ad performance behind the alert */}
      <Modal
        visible={selectedNotif !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedNotif(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelectedNotif(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {selectedNotif && (
              <>
                <View style={styles.rowStart}>
                  <Ionicons name="stats-chart" size={18} color={BrandColors.orange} />
                  <Text style={styles.sheetTitle}>{selectedNotif.title}</Text>
                </View>
                <Text style={styles.sheetTime}>{relativeTime(selectedNotif.created_at)}</Text>
                <Text style={styles.sheetMessage}>{selectedNotif.message}</Text>

                {snapshot ? (
                  <View style={styles.sheetStatGrid}>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{money(snapshot.spend)}</Text>
                      <Text style={styles.statLabel}>Spend (7d)</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{snapshot.leads}</Text>
                      <Text style={styles.statLabel}>Leads</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{snapshot.ctr.toFixed(1)}%</Text>
                      <Text style={styles.statLabel}>CTR</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{snapshot.cpl ? money(snapshot.cpl) : '—'}</Text>
                      <Text style={styles.statLabel}>Cost/lead</Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.muted}>No performance recorded for this period yet.</Text>
                )}

                {selectedNotif.type === 'weekly_report_ready' &&
                  report &&
                  report.status === 'completed' && (
                    <View style={styles.sheetReport}>
                      {report.summary ? (
                        <Text style={styles.summary}>{report.summary}</Text>
                      ) : null}
                      {(report.verdicts ?? []).slice(0, 3).map((v) => {
                        const meta = verdictMeta(v.verdict);
                        return (
                          <View key={v.meta_ad_id} style={styles.verdictRow}>
                            <View style={[styles.verdictBadge, { backgroundColor: meta.color + '22' }]}>
                              <Text style={[styles.verdictText, { color: meta.color }]}>{meta.label}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.verdictName} numberOfLines={1}>{v.ad_name}</Text>
                              <Text style={styles.verdictReason}>{v.suggested_fix}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                <View style={styles.sheetActions}>
                  <Button
                    label="Dismiss"
                    small
                    variant="secondary"
                    style={{ flex: 1 }}
                    onPress={() => onDismissNotif(selectedNotif.id)}
                  />
                  <Button
                    label="Done"
                    small
                    style={{ flex: 1 }}
                    onPress={() => setSelectedNotif(null)}
                  />
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BrandColors.white,
    ...CardShadow,
    borderRadius: Radii.card,
    padding: 16,
    gap: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowStart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    ...TypeScale.h4,
    color: BrandColors.textHeading,
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
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statBox: {
    flexBasis: '47%',
    backgroundColor: BrandColors.cream100,
    borderRadius: Radii.button,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statValue: {
    ...TypeScale.h3,
    color: BrandColors.navy,
  },
  statLabel: {
    ...TypeScale.labelSmall,
    color: BrandColors.textBody,
  },
  summary: {
    ...TypeScale.body,
    color: BrandColors.textBody,
  },
  verdictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
  },
  verdictBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radii.pill,
  },
  verdictText: {
    ...TypeScale.labelSmall,
  },
  verdictName: {
    ...TypeScale.bodyBold,
    color: BrandColors.textHeading,
  },
  verdictReason: {
    ...TypeScale.bodySmall,
    color: BrandColors.textBody,
  },
  campaignName: {
    ...TypeScale.h4,
    color: BrandColors.textHeading,
    flex: 1,
  },
  campaignSub: {
    ...TypeScale.bodySmall,
    color: BrandColors.textBody,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.pill,
  },
  statusText: {
    ...TypeScale.labelSmall,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BrandColors.orange,
  },
  notifHint: {
    ...TypeScale.labelSmall,
    color: BrandColors.orange,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(19, 42, 92, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: BrandColors.white,
    borderRadius: Radii.cardLarge,
    padding: 20,
    gap: 10,
  },
  sheetTitle: { ...TypeScale.h4, color: BrandColors.textHeading, flex: 1 },
  sheetTime: { ...TypeScale.bodySmall, color: BrandColors.textMuted },
  sheetMessage: { ...TypeScale.body, color: BrandColors.textBody },
  sheetStatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  sheetReport: {
    gap: 8,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 12,
  },
  gateIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: BrandColors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateTitle: { ...TypeScale.h3, color: BrandColors.textHeading, textAlign: 'center' },
  gateBody: { ...TypeScale.body, color: BrandColors.textBody, textAlign: 'center' },
  gateSent: { ...TypeScale.bodyBold, color: BrandColors.success, textAlign: 'center' },
});
