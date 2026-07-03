import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Badge, BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

export type Lead = {
  id: string;
  name: string;
  timestamp: string; // e.g. "2h ago"
  source: string; // e.g. "Messenger"
  status: string; // e.g. "Ready", "Qualified"
  statusTone: BadgeTone;
  summary: string;
};

/** Lead card per the approved mockup: avatar, name/meta, status badge, summary, actions. */
export function LeadCard({
  lead,
  onMessage,
  onMarkHandled,
}: {
  lead: Lead;
  onMessage?: (lead: Lead) => void;
  onMarkHandled?: (lead: Lead) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Avatar name={lead.name} />
        <View style={styles.nameBlock}>
          <Text style={styles.name}>{lead.name}</Text>
          <Text style={styles.meta}>
            {lead.timestamp} · via {lead.source}
          </Text>
        </View>
        <Badge label={lead.status} tone={lead.statusTone} />
      </View>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryText}>{lead.summary}</Text>
      </View>

      <View style={styles.actions}>
        <Button label="Message" small onPress={() => onMessage?.(lead)} style={styles.actionButton} />
        <Button
          label="Mark handled"
          variant="secondary"
          small
          onPress={() => onMarkHandled?.(lead)}
          style={styles.actionButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 16,
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nameBlock: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...TypeScale.h4,
    color: BrandColors.textHeading,
  },
  meta: {
    ...TypeScale.bodySmall,
    color: BrandColors.textMuted,
  },
  summaryBox: {
    backgroundColor: BrandColors.screenBg,
    borderRadius: Radii.button,
    padding: 12,
  },
  summaryText: {
    ...TypeScale.body,
    color: BrandColors.textBody,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
  },
});
