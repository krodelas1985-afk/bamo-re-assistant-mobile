import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { LeadCard } from '@/components/lead-card';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { TagPill } from '@/components/ui/tag-pill';
import { BrandColors, TypeScale } from '@/constants/brand';
import { messengerInboxUrl, openMessengerThread, openSms } from '@/lib/contact';
import {
  Lead,
  LeadFilter,
  LEAD_FILTERS,
  fetchLeads,
  fetchMyFbPageId,
  markLeadHandled,
  matchesFilter,
} from '@/lib/leads';

const EMPTY_COPY: Record<LeadFilter, string> = {
  hot: 'No hot leads right now. BaMo will surface them here the moment one heats up. 🔥',
  ready: 'No leads ready for follow-up yet. Warm ones will show up here.',
  viewing: 'No viewings lined up yet. Confirmed viewings will appear here. 📅',
  all: 'No leads yet. New leads from your campaigns will land here automatically.',
};

export default function LeadsScreen() {
  const router = useRouter();
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

  // Default "Message" action: Messenger leads open the client's FB Page inbox
  // (see lib/contact.ts); non-Messenger leads fall back to SMS.
  const onMessage = useCallback(
    (lead: Lead) => {
      if (messengerInboxUrl(fbPageId, lead.messengerId)) {
        openMessengerThread(fbPageId, lead.messengerId);
        return;
      }
      if (lead.phone) {
        openSms(lead.phone);
        return;
      }
      Alert.alert(
        'No contact channel',
        lead.messengerId && !fbPageId
          ? `${lead.name} came from Messenger, but this workspace's Facebook Page isn't connected yet.`
          : `${lead.name} has no phone or Messenger on file yet.`,
      );
    },
    [fbPageId],
  );

  const onOpenLead = useCallback(
    (lead: Lead) => {
      router.push({ pathname: '/lead/[id]', params: { id: lead.id } });
    },
    [router],
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
            onPress={onOpenLead}
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
