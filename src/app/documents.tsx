import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { AgentDocument, fetchMyDocuments } from '@/lib/documents';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

function relTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DocumentsScreen() {
  const router = useRouter();
  const [docs, setDocs] = useState<AgentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: e } = await fetchMyDocuments();
    if (e) setError(e);
    else setDocs(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen title="Documents" onBack={() => router.back()}>
      <Pressable style={styles.newBtn} onPress={() => router.push('/document-editor')}>
        <Ionicons name="add-circle" size={22} color={BrandColors.white} />
        <Text style={styles.newText}>New document</Text>
      </Pressable>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.navy} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Couldn’t load your documents.</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <Button label="Try again" small onPress={load} style={{ marginTop: 4 }} />
        </View>
      ) : docs.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="document-text-outline" size={30} color={BrandColors.navy} />
          </View>
          <Text style={styles.emptyText}>
            No documents yet. Tap “New document” and let BayMo draft an Authority to Sell, MOA, and
            more for you. 📄
          </Text>
        </View>
      ) : (
        docs.map((doc) => (
          <Pressable
            key={doc.id}
            style={styles.row}
            onPress={() => router.push({ pathname: '/document-editor', params: { id: doc.id } })}>
            <View style={styles.iconCircle}>
              <Ionicons name="document-text-outline" size={20} color={BrandColors.navy} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {doc.title || doc.type}
              </Text>
              <Text style={styles.rowSubtitle}>
                {doc.type} · {relTime(doc.updated_at)}
              </Text>
            </View>
            {doc.status === 'final' ? (
              <View style={styles.finalPill}>
                <Text style={styles.finalText}>Final</Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color={BrandColors.textMuted} />
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BrandColors.orange,
    borderRadius: Radii.button,
    paddingVertical: 14,
  },
  newText: { ...TypeScale.button, color: BrandColors.white },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: BrandColors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...TypeScale.body,
    color: BrandColors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  errorDetail: { ...TypeScale.bodySmall, color: BrandColors.textMuted, textAlign: 'center', paddingHorizontal: 24 },
  row: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BrandColors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...TypeScale.h4, color: BrandColors.textHeading },
  rowSubtitle: { ...TypeScale.bodySmall, color: BrandColors.textBody },
  finalPill: {
    backgroundColor: BrandColors.success,
    borderRadius: Radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  finalText: { ...TypeScale.labelSmall, color: BrandColors.white },
});
