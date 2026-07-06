import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LeadFilter>('all');

  const load = useCallback(async () => {
    setError(null);
    const { data, error: e } = await fetchLeads();
    if (e) setError(e);
    else setLeads(data);
    setLoading(false);
  }, []);

  // Re-fetch whenever the tab regains focus.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const visible = useMemo(() => leads.filter((l) => matchesFilter(l, filter)), [leads, filter]);

  const onMessage = useCallback((lead: Lead) => {
    // v1: prefer a real channel. Messenger PSIDs can't be deep-linked directly,
    // so fall back to SMS when a phone number exists.
    const url = lead.phone
      ? `sms:${lead.phone.replace(/\s+/g, '')}`
      : lead.messengerId
        ? `https://m.me/${lead.messengerId}`
        : null;
    if (!url) {
      Alert.alert('No contact channel', `${lead.name} has no phone or Messenger on file yet.`);
      return;
    }
    Linking.openURL(url).catch(() =>
      Alert.alert('Could not open', 'No app available to handle this message.'),
    );
  }, []);

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
