import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Lead, LeadCard } from '@/components/lead-card';
import { Screen } from '@/components/screen';
import { TagPill } from '@/components/ui/tag-pill';

const FILTERS = ['🔥 Hot', '✅ Ready', '📅 For Viewing', 'All'] as const;

// Sample data — replaced by live Supabase queries in Phase 2.
const SAMPLE_LEADS: Lead[] = [
  {
    id: '1',
    name: 'Maria Santos',
    timestamp: '2h ago',
    source: 'Messenger',
    status: 'Ready',
    statusTone: 'success',
    summary:
      'Looking for a 3BR house in Lipa, budget ₱4–5M, Pag-IBIG financing. Prefers viewing this weekend.',
  },
  {
    id: '2',
    name: 'Juan Dela Cruz',
    timestamp: '5h ago',
    source: 'Messenger',
    status: 'Qualified',
    statusTone: 'warm',
    summary: 'Interested in Vermira 2BR units. Asked about reservation fee and monthly amortization.',
  },
  {
    id: '3',
    name: 'Ana Reyes',
    timestamp: 'Yesterday',
    source: 'Marketplace',
    status: 'For Viewing',
    statusTone: 'info',
    summary: 'Confirmed tripping on Saturday 10 AM at Vermira Lipa. Bringing spouse.',
  },
];

export default function LeadsScreen() {
  const [activeFilter, setActiveFilter] = useState<string>(FILTERS[0]);

  return (
    <Screen title="Leads">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <TagPill key={f} label={f} active={f === activeFilter} onPress={() => setActiveFilter(f)} />
          ))}
        </View>
      </ScrollView>

      {SAMPLE_LEADS.map((lead) => (
        <LeadCard key={lead.id} lead={lead} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexGrow: 0,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
  },
});
