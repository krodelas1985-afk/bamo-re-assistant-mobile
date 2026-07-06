import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { LeadCard } from '@/components/lead-card';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { TagPill } from '@/components/ui/tag-pill';
import { BrandColors, TypeScale } from '@/constants/brand';
import {
  Lead,
  LeadFilter,
  LEAD_FILTERS,
  fetchLeads,
  fetchMyFbPageId,
  markLeadHandled,
  matchesFilter,
} from '@/lib/leads';

// One-time flag: agent has seen the "this opens your FB Page inbox" explainer.
const FB_INBOX_HINT_KEY = 'bamo.leads.fbInboxHintSeen';

const EMPTY_COPY: Record<LeadFilter, string> = {
  hot: 'No hot leads right now. BaMo will surface them here the moment one heats up. 🔥',
  ready: 'No leads ready for follow-up yet. Warm ones will show up here.',
  viewing: 'No viewings lined up yet. Confirmed viewings will appear here. 📅',
  all: 'No leads yet. New leads from your campaigns will land here automatically.',
};

export default function LeadsScreen() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LeadFilter>('all');
  // The client's FB Page ID, used to deep-link Messenger leads into the Page
  // inbox. Fetched once (all of this user's leads belong to the same Page).
  const [fbPageId, setFbPageId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: e } = await fetchLeads();
    if (e) setError(e);
    else setLeads(data);
    setLoading(false);
  }, []);

  // Resolve the client's Page ID once, on first mount.
  useEffect(() => {
    fetchMyFbPageId().then(setFbPageId);
  }, []);

  // Re-fetch whenever the tab regains focus.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const visible = useMemo(() => leads.filter((l) => matchesFilter(l, filter)), [leads, filter]);

  const onMessage = useCallback(
    (lead: Lead) => {
      // Messenger leads open the client's Facebook Page inbox at this
      // conversation (Meta Business Suite). This requires the client's Page ID
      // (fbPageId) + the lead's PSID (messengerId); the signed-in agent must hold
      // a "Messages" role on that Page for the thread to load. A bare m.me/<PSID>
      // link does NOT work — PSIDs aren't personal profiles, so we route through
      // the Page inbox instead. Non-Messenger leads fall back to SMS.
      const messengerUrl =
        lead.messengerId && fbPageId
          ? `https://business.facebook.com/latest/inbox/all/?asset_id=${fbPageId}` +
            `&selected_item_id=${lead.messengerId}&thread_type=FB_MESSAGE`
          : null;
      const smsUrl = lead.phone ? `sms:${lead.phone.replace(/\s+/g, '')}` : null;
      const url = messengerUrl ?? smsUrl;
      if (!url) {
        Alert.alert(
          'No contact channel',
          lead.messengerId && !fbPageId
            ? `${lead.name} came from Messenger, but this workspace's Facebook Page isn't connected yet.`
            : `${lead.name} has no phone or Messenger on file yet.`,
        );
        return;
      }

      const open = () =>
        Linking.openURL(url).catch(() =>
          Alert.alert('Could not open', 'No app available to handle this message.'),
        );

      // First time an agent opens a Messenger lead's Page inbox, explain that it
      // lives in the client's Facebook Page — so if the thread doesn't load they
      // can self-diagnose it as missing Page "Messages" access rather than a bug.
      // Shown once, then remembered.
      if (messengerUrl) {
        AsyncStorage.getItem(FB_INBOX_HINT_KEY).then((seen) => {
          if (seen) {
            open();
            return;
          }
          Alert.alert(
            'Opens your Facebook Page inbox',
            "This lead messaged your Facebook Page, so the reply opens in Meta Business Suite. " +
              "If the conversation doesn't load, ask your workspace admin to give you " +
              '“Messages” access to the Page.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open inbox',
                onPress: () => {
                  AsyncStorage.setItem(FB_INBOX_HINT_KEY, '1').catch(() => {});
                  open();
                },
              },
            ],
          );
        });
        return;
      }

      open();
    },
    [fbPageId],
  );

  const onMarkHandled = useCallback(async (lead: Lead) => {
    setLeads((prev) => prev.filter((l) => l.id !== lead.id)); // optimistic
    const { error: e, reassigned } = await markLeadHandled(lead.id);
    if (reassigned) {
      Alert.alert(
        'Lead reassigned',
        `${lead.name} is no longer assigned to you — it was handed to another agent.`,
      );
      load(); // resync the list from RLS
      return;
    }
    if (e) {
      Alert.alert('Could not update', e);
      load(); // revert by re-fetching
    }
  }, [load]);

  return (
    <Screen title="Leads">
      <View style={styles.filters}>
        {LEAD_FILTERS.map((f) => (
          <TagPill
            key={f.key}
            label={f.label}
            active={f.key === filter}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.navy} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Couldn&apos;t load your leads.</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <Button label="Try again" small onPress={load} style={styles.retry} />
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{EMPTY_COPY[filter]}</Text>
        </View>
      ) : (
        visible.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onMessage={onMessage}
            onMarkHandled={onMarkHandled}
          />
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  emptyText: {
    ...TypeScale.body,
    color: BrandColors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  errorDetail: {
    ...TypeScale.bodySmall,
    color: BrandColors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retry: {
    marginTop: 4,
  },
});
