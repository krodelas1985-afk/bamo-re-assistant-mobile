import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TagPill } from '@/components/ui/tag-pill';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import {
  DOC_TYPES,
  DocStatus,
  createDocument,
  deleteDocument,
  exportDocumentPdf,
  fetchDocument,
  generateDocument,
  updateDocument,
} from '@/lib/documents';

export default function DocumentEditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { profile, session } = useAuth();
  const clientId = profile?.client_id ?? null;
  const isNew = !id;

  const [loading, setLoading] = useState(!isNew);
  const [type, setType] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [context, setContext] = useState('');
  const [status, setStatus] = useState<DocStatus>('draft');

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (isNew) return;
    fetchDocument(id!).then(({ data, error }) => {
      if (error || !data) {
        Alert.alert('Could not open', error ?? 'Document not found.');
        router.back();
        return;
      }
      setType(data.type);
      setTitle(data.title);
      setBody(data.body);
      setStatus(data.status);
      setLoading(false);
    });
  }, [id, isNew, router]);

  const generate = async () => {
    if (!type) {
      Alert.alert('Pick a document type', 'Choose which document BayMo should draft.');
      return;
    }
    setGenerating(true);
    const { body: draft, error } = await generateDocument(type, context);
    setGenerating(false);
    if (error || draft == null) {
      Alert.alert('Could not generate', error ?? 'Please try again.');
      return;
    }
    setBody(draft);
    if (!title.trim()) setTitle(type);
  };

  const save = async () => {
    if (!clientId || !session?.user) {
      Alert.alert('Not ready', 'Your workspace is still being set up. Please try again shortly.');
      return;
    }
    if (!body.trim()) {
      Alert.alert('Nothing to save', 'Generate or write the document first.');
      return;
    }
    setSaving(true);
    if (isNew) {
      const { error } = await createDocument(clientId, session.user.id, {
        type: type || 'Document',
        title: title.trim() || type || 'Untitled document',
        body,
        lead_id: null,
        status,
      });
      setSaving(false);
      if (error) return Alert.alert('Could not save', error);
      router.back();
    } else {
      const { error } = await updateDocument(id!, { title: title.trim() || type, body, status });
      setSaving(false);
      if (error) return Alert.alert('Could not save', error);
      router.back();
    }
  };

  const exportPdf = async () => {
    if (!body.trim()) {
      Alert.alert('Nothing to export', 'Generate or write the document first.');
      return;
    }
    setExporting(true);
    const { error } = await exportDocumentPdf({ type: type || 'Document', title, body });
    setExporting(false);
    if (error) Alert.alert('Could not export PDF', error);
  };

  const shareText = async () => {
    if (!body.trim()) return;
    try {
      await Share.share({ message: body });
    } catch {
      /* dismissed */
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete document?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteDocument(id!);
          if (error) Alert.alert('Could not delete', error);
          else router.back();
        },
      },
    ]);
  };

  const toggleFinal = () => setStatus((s) => (s === 'final' ? 'draft' : 'final'));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={BrandColors.textHeading} />
        </Pressable>
        <Text style={styles.headerTitle}>{isNew ? 'New document' : 'Document'}</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.navy} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {isNew && (
            <>
              <Text style={styles.section}>Document type</Text>
              <View style={styles.pillRow}>
                {DOC_TYPES.map((t) => (
                  <TagPill key={t} label={t} active={type === t} onPress={() => setType(t)} />
                ))}
              </View>

              <View style={styles.aiCard}>
                <Text style={styles.aiTitle}>✨ Draft with BayMo</Text>
                <Text style={styles.aiSub}>
                  Add the details you have (parties, property, price, dates). BayMo drafts the
                  document and leaves [BRACKETED] blanks for anything missing.
                </Text>
                <TextField
                  label="Details (optional)"
                  value={context}
                  onChangeText={setContext}
                  placeholder="e.g. Seller: Juan Dela Cruz; Property: Lot 5 Blk 3 Vermira Lipa; Price ₱4.5M; 6-month authority"
                  multiline
                  numberOfLines={3}
                />
                <Button
                  label={generating ? 'BayMo is drafting…' : '✨ Generate draft'}
                  onPress={generate}
                  style={{ marginTop: 2 }}
                />
              </View>
            </>
          )}

          {(!isNew || !!body) && (
            <>
              <TextField
                label="Title"
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Authority to Sell — Vermira Lot 5"
              />
              <TextField
                label="Document"
                value={body}
                onChangeText={setBody}
                placeholder="The document text appears here. Edit the [BRACKETED] blanks."
                multiline
                numberOfLines={16}
                style={styles.bodyInput}
                textAlignVertical="top"
              />

              <Pressable style={styles.finalRow} onPress={toggleFinal}>
                <Ionicons
                  name={status === 'final' ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={status === 'final' ? BrandColors.success : BrandColors.textMuted}
                />
                <Text style={styles.finalLabel}>Mark as final</Text>
              </Pressable>

              <Button
                label={exporting ? 'Preparing PDF…' : '⬇︎  Download PDF'}
                onPress={exportPdf}
                style={{ marginTop: 4 }}
              />
              <Button label="Share as text" variant="secondary" onPress={shareText} />
              {!isNew && (
                <Pressable onPress={confirmDelete} style={styles.deleteRow}>
                  <Ionicons name="trash-outline" size={18} color={BrandColors.error} />
                  <Text style={styles.deleteText}>Delete document</Text>
                </Pressable>
              )}
            </>
          )}

          {!clientId && (
            <Text style={styles.warn}>
              Your workspace isn’t linked yet, so saving is disabled. Finish onboarding first.
            </Text>
          )}
        </ScrollView>
      )}

      {(!isNew || !!body) && !loading && (
        <View style={styles.footer}>
          <Button
            label={saving ? 'Saving…' : isNew ? 'Save document' : 'Save changes'}
            onPress={save}
            style={{ width: '100%' }}
          />
        </View>
      )}
    </SafeAreaView>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  section: { ...TypeScale.h4, color: BrandColors.textHeading, marginTop: 4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  aiCard: {
    backgroundColor: BrandColors.cream100,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: BrandColors.orangeSoft,
    padding: 16,
    gap: 10,
  },
  aiTitle: { ...TypeScale.h4, color: BrandColors.orangeDark },
  aiSub: { ...TypeScale.bodySmall, color: BrandColors.textBody },
  bodyInput: { minHeight: 280 },
  finalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  finalLabel: { ...TypeScale.body, color: BrandColors.textHeading },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  deleteText: { ...TypeScale.bodyBold, color: BrandColors.error },
  warn: { ...TypeScale.bodySmall, color: BrandColors.error, marginTop: 4 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
    backgroundColor: BrandColors.white,
  },
});
