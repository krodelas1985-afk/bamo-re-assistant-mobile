import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { LeadCard } from '@/components/lead-card';
import { LeadsEmptyState } from '@/components/leads-empty-state';
import { LeadFilterSheet } from '@/components/lead-filter-sheet';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { TagPill } from '@/components/ui/tag-pill';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import { messengerInboxUrl, openMessengerThread, openSms } from '@/lib/contact';
import {
  BUDGET_BUCKETS,
  EMPTY_LEAD_FILTERS,
  Lead,
  LeadFilter,
  LeadFilters,
  LeadSort,
  LEAD_FILTERS,
  SORT_OPTIONS,
  countActiveFilters,
  fetchLeads,
  fetchMyFbPageId,
  markLeadHandled,
  matchesAdvancedFilters,
  matchesFilter,
  matchesSearch,
  sortLeads,
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
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<LeadFilters>(EMPTY_LEAD_FILTERS);
  const [sort, setSort] = useState<LeadSort>('recent');
  const [sheetOpen, setSheetOpen] = useState(false);
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

  // Sources actually present in this workspace's leads drive the Source filter.
  const sourceOptions = useMemo(
    () => [...new Set(leads.map((l) => l.source))].sort(),
    [leads],
  );

  // Quick pill + search apply first; the sheet's live count reuses this base.
  const base = useMemo(
    () => leads.filter((l) => matchesFilter(l, filter) && matchesSearch(l, search)),
    [leads, filter, search],
  );

  const visible = useMemo(
    () => sortLeads(base.filter((l) => matchesAdvancedFilters(l, filters)), sort),
    [base, filters, sort],
  );

  const activeCount = countActiveFilters(filters);
  const filtering = activeCount > 0 || search.trim().length > 0 || sort !== 'recent';

  const countFor = useCallback(
    (f: LeadFilters) => base.filter((l) => matchesAdvancedFilters(l, f)).length,
    [base],
  );

  const clearAll = () => {
    setFilters(EMPTY_LEAD_FILTERS);
    setSort('recent');
    setSearch('');
  };

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
    <Screen
      title="Leads"
      headerRight={
        <Pressable style={styles.addBtn} onPress={() => router.push('/lead-new')}>
          <Ionicons name="add" size={18} color={BrandColors.white} />
          <Text style={styles.addBtnText}>Add lead</Text>
        </Pressable>
      }>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={BrandColors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, email, or phone"
          placeholderTextColor={BrandColors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={BrandColors.textMuted} />
          </Pressable>
        )}
      </View>

      <View style={styles.filters}>
        {LEAD_FILTERS.map((f) => (
          <TagPill
            key={f.key}
            label={f.label}
            active={f.key === filter}
            onPress={() => setFilter(f.key)}
          />
        ))}
        <Pressable style={styles.filterBtn} onPress={() => setSheetOpen(true)}>
          <Ionicons name="options-outline" size={16} color={BrandColors.navy} />
          <Text style={styles.filterBtnText}>Filters</Text>
          {activeCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <ActiveFilterChips filters={filters} sort={sort} onFilters={setFilters} onSort={setSort} />

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
      ) : leads.length === 0 && !filtering ? (
        // Brand-new workspace: show the get-started funnel instead of empty copy.
        <LeadsEmptyState pageConnected={fbPageId != null} />
      ) : visible.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {filtering
              ? 'No leads match your search or filters.'
              : EMPTY_COPY[filter]}
          </Text>
          {filtering && <Button label="Clear filters" small onPress={clearAll} style={styles.retry} />}
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

      <LeadFilterSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        sort={sort}
        sourceOptions={sourceOptions}
        countFor={countFor}
        onApply={(f, s) => {
          setFilters(f);
          setSort(s);
        }}
      />
    </Screen>
  );
}

/** Removable chips summarizing the applied sheet selections. */
function ActiveFilterChips({
  filters,
  sort,
  onFilters,
  onSort,
}: {
  filters: LeadFilters;
  sort: LeadSort;
  onFilters: (f: LeadFilters) => void;
  onSort: (s: LeadSort) => void;
}) {
  const chips: { key: string; label: string; onRemove: () => void }[] = [];

  const drop = (field: keyof LeadFilters, value: string) =>
    onFilters({
      ...filters,
      [field]: (filters[field] as string[]).filter((v) => v !== value),
    });

  filters.temperatures.forEach((v) =>
    chips.push({ key: `t-${v}`, label: v, onRemove: () => drop('temperatures', v) }),
  );
  filters.statuses.forEach((v) =>
    chips.push({ key: `s-${v}`, label: v, onRemove: () => drop('statuses', v) }),
  );
  filters.sources.forEach((v) =>
    chips.push({ key: `src-${v}`, label: v, onRemove: () => drop('sources', v) }),
  );
  filters.leadTypes.forEach((v) =>
    chips.push({ key: `lt-${v}`, label: v, onRemove: () => drop('leadTypes', v) }),
  );
  filters.budgets.forEach((v) => {
    const label = BUDGET_BUCKETS.find((b) => b.key === v)?.label ?? v;
    chips.push({ key: `b-${v}`, label, onRemove: () => drop('budgets', v) });
  });
  if (filters.timeframe.trim())
    chips.push({
      key: 'tf',
      label: `Timeframe: ${filters.timeframe.trim()}`,
      onRemove: () => onFilters({ ...filters, timeframe: '' }),
    });
  if (filters.currentLocation.trim())
    chips.push({
      key: 'cl',
      label: `From: ${filters.currentLocation.trim()}`,
      onRemove: () => onFilters({ ...filters, currentLocation: '' }),
    });
  if (filters.preferredLocation.trim())
    chips.push({
      key: 'pl',
      label: `Wants: ${filters.preferredLocation.trim()}`,
      onRemove: () => onFilters({ ...filters, preferredLocation: '' }),
    });
  if (sort !== 'recent')
    chips.push({
      key: 'sort',
      label: SORT_OPTIONS.find((s) => s.key === sort)?.label ?? sort,
      onRemove: () => onSort('recent'),
    });

  if (chips.length === 0) return null;
  return (
    <View style={styles.activeChips}>
      {chips.map((c) => (
        <Pressable key={c.key} style={styles.activeChip} onPress={c.onRemove}>
          <Text style={styles.activeChipText}>{c.label}</Text>
          <Ionicons name="close" size={13} color={BrandColors.navy} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BrandColors.orange,
    borderRadius: Radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addBtnText: { ...TypeScale.label, color: BrandColors.white },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BrandColors.white,
    borderWidth: 1,
    borderColor: BrandColors.border,
    borderRadius: Radii.button,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  searchInput: {
    ...TypeScale.body,
    flex: 1,
    color: BrandColors.textHeading,
    paddingVertical: 8,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 'auto',
    backgroundColor: BrandColors.white,
    borderWidth: 1,
    borderColor: BrandColors.borderDark,
    borderRadius: Radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterBtnText: { ...TypeScale.label, color: BrandColors.navy },
  filterBadge: {
    backgroundColor: BrandColors.orange,
    borderRadius: Radii.pill,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: { ...TypeScale.labelSmall, color: BrandColors.white },
  activeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BrandColors.cream200,
    borderRadius: Radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activeChipText: { ...TypeScale.labelSmall, color: BrandColors.navy },
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
