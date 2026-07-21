import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TagPill } from '@/components/ui/tag-pill';
import { TextField } from '@/components/ui/text-field';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';
import { useAuth } from '@/contexts/auth-context';
import {
  AUTOMATION_GOALS,
  AUTOMATION_TONES,
  AutomationDraft,
  AutomationScope,
  MAX_QUAL_QUESTIONS,
  QUAL_LIBRARY,
  SCOPE_OPTIONS,
  TIME_WINDOWS,
  fetchKbSourceCount,
  fetchMyAutomations,
  submitAutomation,
} from '@/lib/automations';
import { fetchLatestPageConnectionRequest } from '@/lib/page-connection';
import { fetchMyFbPageId } from '@/lib/leads';
import { fetchListingOptions } from '@/lib/website';

const STEPS = ['Type', 'Goal', 'Style', 'Questions', 'Knowledge', 'Hours', 'Leads', 'Review'] as const;

const SOURCE_OPTIONS = [
  { key: 'messenger', label: 'Facebook Messenger', hint: 'People who message your Page' },
  { key: 'webform', label: 'Web form', hint: 'Leads from your landing-page form' },
  { key: 'website', label: 'My agent website', hint: 'Inquiries from your BaMo website' },
] as const;

export default function AutomationNewScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const clientId = profile?.client_id ?? null;
  const userId = session?.user.id ?? null;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Draft state
  const [scope, setScope] = useState<AutomationScope>('general');
  const [scopedTitle, setScopedTitle] = useState('');
  const [listingId, setListingId] = useState<string | null>(null);
  const [adLinkMode, setAdLinkMode] = useState<AutomationDraft['adLinkMode']>('bamo_managed');
  const [fbAdId, setFbAdId] = useState('');
  const [organicOwner, setOrganicOwner] = useState(false);
  const [goal, setGoal] = useState<AutomationDraft['goal']>('qualify');
  const [tone, setTone] = useState<string>('Friendly');
  const [personaNotes, setPersonaNotes] = useState('');
  const [questions, setQuestions] = useState<string[]>(['budget', 'timeframe', 'phone']);
  const [customQuestion, setCustomQuestion] = useState('');
  const [windowKey, setWindowKey] = useState<AutomationDraft['windowKey']>('always');
  const [enrollExisting, setEnrollExisting] = useState(false);
  const [sources, setSources] = useState<string[]>(['messenger']);
  const [name, setName] = useState('My BayMo Assistant');

  // Context for the Type, Knowledge + Leads steps
  const [kbCount, setKbCount] = useState<number | null>(null);
  const [pageConnected, setPageConnected] = useState<boolean | null>(null);
  const [listings, setListings] = useState<{ id: string; title: string }[]>([]);
  const [hasGeneral, setHasGeneral] = useState(false);
  const [hasOrganicOwner, setHasOrganicOwner] = useState(false);

  useEffect(() => {
    fetchKbSourceCount().then(setKbCount);
    fetchListingOptions().then(setListings);
    fetchMyAutomations().then((autos) => {
      const open = autos.filter((a) => a.status !== 'completed');
      const general = open.some((a) => a.scope === 'general');
      setHasGeneral(general);
      setHasOrganicOwner(open.some((a) => a.isOrganicOwner));
      // A second automation can only be scoped.
      if (general) setScope('project');
    });
    Promise.all([fetchMyFbPageId(), fetchLatestPageConnectionRequest()]).then(
      ([pageId, req]) => setPageConnected(pageId != null || req?.status === 'connected'),
    );
  }, []);

  const toggleQuestion = (field: string) =>
    setQuestions((prev) =>
      prev.includes(field)
        ? prev.filter((f) => f !== field)
        : prev.length >= MAX_QUAL_QUESTIONS
          ? prev
          : [...prev, field],
    );

  const toggleSource = (key: string) =>
    setSources((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key],
    );

  const stepValid = () => {
    switch (STEPS[step]) {
      case 'Type':
        return scope === 'general' || scopedTitle.trim().length > 0 || listingId != null;
      case 'Questions':
        return questions.length >= 2 || (questions.length >= 1 && customQuestion.trim().length > 0);
      case 'Leads':
        return true;
      case 'Review':
        return sources.length > 0;
      default:
        return true;
    }
  };

  const next = () => {
    if (STEPS[step] === 'Type' && !stepValid()) {
      Alert.alert('Which property?', 'Pick a listing or type the project/property name.');
      return;
    }
    if (STEPS[step] === 'Questions' && !stepValid()) {
      Alert.alert('Pick at least 2 questions', 'BayMo needs a few questions to qualify leads well.');
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const back = () => (step === 0 ? router.back() : setStep((s) => s - 1));

  const submit = async () => {
    if (!clientId || !userId) {
      Alert.alert('Not ready', 'Your workspace is still being set up. Please try again shortly.');
      return;
    }
    if (sources.length === 0) {
      Alert.alert('Pick a lead source', 'Choose at least one place BayMo should answer.');
      return;
    }
    setSaving(true);
    const { error } = await submitAutomation(clientId, userId, {
      scope,
      scopedTitle:
        scope !== 'general' && listingId
          ? (listings.find((l) => l.id === listingId)?.title ?? scopedTitle)
          : scopedTitle,
      listingId: scope === 'general' ? null : listingId,
      adLinkMode,
      fbAdId,
      organicOwner: scope !== 'general' && organicOwner,
      goal,
      tone,
      personaNotes,
      questions,
      customQuestion,
      windowKey,
      enrollExisting,
      sources,
      name,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not submit', error);
      return;
    }
    Alert.alert(
      'Submitted for review 🎉',
      'The BaMo team will check your setup, wire everything up, and activate BayMo — you’ll get a notification when it’s live.',
      [{ text: 'Done', onPress: () => router.back() }],
    );
  };

  const goalMeta = AUTOMATION_GOALS.find((g) => g.key === goal)!;
  const windowMeta = TIME_WINDOWS.find((w) => w.key === windowKey)!;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={12}>
          <Ionicons
            name={step === 0 ? 'close' : 'arrow-back'}
            size={26}
            color={BrandColors.textHeading}
          />
        </Pressable>
        <Text style={styles.headerTitle}>Set up BayMo</Text>
        <Text style={styles.stepCount}>
          {step + 1}/{STEPS.length}
        </Text>
      </View>

      <View style={styles.dots}>
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.dot, i <= step && styles.dotActive]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {STEPS[step] === 'Type' && (
          <>
            <Text style={styles.question}>What is this automation for?</Text>
            {SCOPE_OPTIONS.map((s) => {
              const disabled = s.key === 'general' && hasGeneral;
              return (
                <View key={s.key} style={disabled && { opacity: 0.5 }}>
                  <ChoiceCard
                    title={s.label + (disabled ? ' — already set up' : '')}
                    body={s.description}
                    active={scope === s.key}
                    onPress={() => {
                      if (!disabled) setScope(s.key);
                    }}
                  />
                </View>
              );
            })}
            {scope !== 'general' && (
              <>
                <Text style={styles.section}>
                  {scope === 'project' ? 'Which project?' : 'Which listing?'}
                </Text>
                {listings.length > 0 && (
                  <View style={styles.pillRow}>
                    {listings.slice(0, 8).map((l) => (
                      <TagPill
                        key={l.id}
                        label={l.title || 'Untitled'}
                        active={listingId === l.id}
                        onPress={() => setListingId(listingId === l.id ? null : l.id)}
                      />
                    ))}
                  </View>
                )}
                <TextField
                  label={listingId ? 'Or type a different name' : 'Project / property name'}
                  value={scopedTitle}
                  onChangeText={setScopedTitle}
                  placeholder="e.g. Vermira Living Spaces"
                />
              </>
            )}
          </>
        )}

        {STEPS[step] === 'Goal' && (
          <>
            <Text style={styles.question}>What should BayMo do with new leads?</Text>
            {AUTOMATION_GOALS.map((g) => (
              <ChoiceCard
                key={g.key}
                title={g.label}
                body={g.description}
                active={goal === g.key}
                onPress={() => setGoal(g.key)}
              />
            ))}
          </>
        )}

        {STEPS[step] === 'Style' && (
          <>
            <Text style={styles.question}>How should BayMo sound?</Text>
            <View style={styles.pillRow}>
              {AUTOMATION_TONES.map((t) => (
                <TagPill key={t} label={t} active={tone === t} onPress={() => setTone(t)} />
              ))}
            </View>
            <TextField
              label="Anything else about how BayMo should talk? (optional)"
              value={personaNotes}
              onChangeText={setPersonaNotes}
              placeholder="e.g. Use po and opo. Mention I’ve been selling in Cavite for 10 years."
              multiline
              numberOfLines={3}
            />
          </>
        )}

        {STEPS[step] === 'Questions' && (
          <>
            <Text style={styles.question}>What should BayMo ask to qualify a lead?</Text>
            <Text style={styles.hint}>
              Pick up to {MAX_QUAL_QUESTIONS}. {questions.length} selected.
            </Text>
            {QUAL_LIBRARY.map((q) => {
              const active = questions.includes(q.field);
              return (
                <ChoiceCard
                  key={q.field}
                  title={q.label}
                  body={q.question}
                  active={active}
                  check
                  onPress={() => toggleQuestion(q.field)}
                />
              );
            })}
            <TextField
              label="Add your own question (optional)"
              value={customQuestion}
              onChangeText={setCustomQuestion}
              placeholder="e.g. OFW po ba kayo o based here sa Pilipinas?"
            />
          </>
        )}

        {STEPS[step] === 'Knowledge' && (
          <>
            <Text style={styles.question}>What does BayMo know about your properties?</Text>
            <View style={styles.kbCard}>
              <Ionicons
                name={kbCount ? 'library-outline' : 'alert-circle-outline'}
                size={28}
                color={kbCount ? BrandColors.success : BrandColors.orange}
              />
              <Text style={styles.kbTitle}>
                {kbCount == null
                  ? 'Checking your knowledge base…'
                  : kbCount > 0
                    ? `${kbCount} knowledge source${kbCount === 1 ? '' : 's'} ready`
                    : 'No knowledge sources yet'}
              </Text>
              <Text style={styles.kbBody}>
                BayMo only answers from what you give it — brochures, price lists, listing details.
                {kbCount === 0
                  ? ' Send your materials to the BaMo team (or via BayMo chat) and we’ll load them during review.'
                  : ' The BaMo team double-checks these during review.'}
              </Text>
            </View>
            <Text style={styles.hint}>
              Tip: the more complete your materials, the fewer questions BayMo has to hand back to
              you.
            </Text>
          </>
        )}

        {STEPS[step] === 'Hours' && (
          <>
            <Text style={styles.question}>When should BayMo answer for you?</Text>
            {TIME_WINDOWS.map((w) => (
              <ChoiceCard
                key={w.key}
                title={w.label}
                body={w.description}
                active={windowKey === w.key}
                onPress={() => setWindowKey(w.key)}
              />
            ))}
            {windowKey !== 'always' && (
              <Text style={styles.warn}>
                Heads up: outside BayMo’s hours, messages wait for YOU. Most agents pick 24/7 so no
                lead goes unanswered.
              </Text>
            )}
          </>
        )}

        {STEPS[step] === 'Leads' && (
          <>
            <Text style={styles.question}>Which leads should BayMo talk to?</Text>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.switchTitle}>New leads</Text>
                <Text style={styles.switchBody}>
                  Everyone who messages from the moment BayMo goes live. Always on.
                </Text>
              </View>
              <Switch value disabled trackColor={{ true: BrandColors.navy }} />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.switchTitle}>My existing leads</Text>
                <Text style={styles.switchBody}>
                  The BaMo team will also enroll the leads already in your list when they activate
                  BayMo.
                </Text>
              </View>
              <Switch
                value={enrollExisting}
                onValueChange={setEnrollExisting}
                trackColor={{ true: BrandColors.navy }}
              />
            </View>

            {scope !== 'general' && (
              <>
                <Text style={[styles.question, { marginTop: 12 }]}>
                  How do leads reach this automation?
                </Text>
                <ChoiceCard
                  title="BaMo runs my ads (recommended)"
                  body="We link the ads we set up for this property automatically."
                  active={adLinkMode === 'bamo_managed'}
                  onPress={() => setAdLinkMode('bamo_managed')}
                />
                <ChoiceCard
                  title="I have my own Facebook Ad"
                  body="Enter the Ad ID so BayMo knows which leads belong here."
                  active={adLinkMode === 'own_ad_id'}
                  onPress={() => setAdLinkMode('own_ad_id')}
                />
                {adLinkMode === 'own_ad_id' && (
                  <TextField
                    label="Facebook Ad ID"
                    value={fbAdId}
                    onChangeText={setFbAdId}
                    placeholder="e.g. 120210000000000000"
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                )}
                {!hasOrganicOwner && (
                  <View style={styles.switchRow}>
                    <View style={styles.switchText}>
                      <Text style={styles.switchTitle}>Also answer direct messages</Text>
                      <Text style={styles.switchBody}>
                        People who message your Page directly (not from an ad) will also get this
                        automation. Only one automation can do this.
                      </Text>
                    </View>
                    <Switch
                      value={organicOwner}
                      onValueChange={setOrganicOwner}
                      trackColor={{ true: BrandColors.navy }}
                    />
                  </View>
                )}
              </>
            )}

            <Text style={[styles.question, { marginTop: 12 }]}>Where do your leads come from?</Text>
            {SOURCE_OPTIONS.map((s) => (
              <ChoiceCard
                key={s.key}
                title={s.label}
                body={s.hint}
                active={sources.includes(s.key)}
                check
                onPress={() => toggleSource(s.key)}
              />
            ))}
            {sources.includes('messenger') && pageConnected === false && (
              <Text style={styles.warn}>
                Your Facebook Page isn’t connected yet — you can still submit, and we’ll help you
                connect it during review.
              </Text>
            )}
          </>
        )}

        {STEPS[step] === 'Review' && (
          <>
            <Text style={styles.question}>Ready to submit?</Text>
            <TextField label="Name your automation" value={name} onChangeText={setName} />
            <ReviewRow
              label="Type"
              value={
                scope === 'general'
                  ? 'Everything I sell'
                  : `${scope === 'project' ? 'Project' : 'Listing'}: ${
                      listingId
                        ? (listings.find((l) => l.id === listingId)?.title ?? scopedTitle)
                        : scopedTitle
                    }${organicOwner ? ' (also answers direct messages)' : ''}`
              }
            />
            <ReviewRow label="Goal" value={goalMeta.label} />
            <ReviewRow
              label="Style"
              value={tone + (personaNotes.trim() ? ` — ${personaNotes.trim()}` : '')}
            />
            <ReviewRow
              label="Questions"
              value={
                QUAL_LIBRARY.filter((q) => questions.includes(q.field))
                  .map((q) => q.label)
                  .join(', ') + (customQuestion.trim() ? ` + 1 custom` : '')
              }
            />
            <ReviewRow
              label="Knowledge"
              value={kbCount ? `${kbCount} source${kbCount === 1 ? '' : 's'}` : 'To be loaded during review'}
            />
            <ReviewRow label="BayMo hours" value={windowMeta.label} />
            <ReviewRow
              label="Leads"
              value={`New leads${enrollExisting ? ' + existing leads' : ''}`}
            />
            <ReviewRow
              label="Sources"
              value={SOURCE_OPTIONS.filter((s) => sources.includes(s.key))
                .map((s) => s.label)
                .join(', ')}
            />
            <Text style={styles.hint}>
              The BaMo team reviews every setup, loads your knowledge, connects your Page, and
              activates BayMo. Nothing goes live without review.
            </Text>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {STEPS[step] === 'Review' ? (
          <Button
            label={saving ? 'Submitting…' : 'Submit for review'}
            onPress={submit}
            style={{ width: '100%' }}
          />
        ) : (
          <Button label="Next" onPress={next} style={{ width: '100%' }} />
        )}
      </View>
    </SafeAreaView>
  );
}

function ChoiceCard({
  title,
  body,
  active,
  check,
  onPress,
}: {
  title: string;
  body: string;
  active: boolean;
  check?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.choice, active && styles.choiceActive]} onPress={onPress}>
      <View style={styles.choiceText}>
        <Text style={[styles.choiceTitle, active && { color: BrandColors.navy }]}>{title}</Text>
        <Text style={styles.choiceBody}>{body}</Text>
      </View>
      <Ionicons
        name={
          check
            ? active
              ? 'checkbox'
              : 'square-outline'
            : active
              ? 'radio-button-on'
              : 'radio-button-off'
        }
        size={22}
        color={active ? BrandColors.navy : BrandColors.textMuted}
      />
    </Pressable>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
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
  stepCount: { ...TypeScale.label, color: BrandColors.textMuted, width: 26, textAlign: 'right' },
  dots: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: BrandColors.white,
  },
  dot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: BrandColors.border },
  dotActive: { backgroundColor: BrandColors.orange },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  question: { ...TypeScale.h3, color: BrandColors.textHeading },
  section: { ...TypeScale.h4, color: BrandColors.textHeading, marginTop: 8 },
  hint: { ...TypeScale.bodySmall, color: BrandColors.textMuted },
  warn: { ...TypeScale.bodySmall, color: BrandColors.orange },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BrandColors.white,
    borderWidth: 1.5,
    borderColor: BrandColors.border,
    borderRadius: Radii.card,
    padding: 14,
  },
  choiceActive: { borderColor: BrandColors.navy },
  choiceText: { flex: 1, gap: 2 },
  choiceTitle: { ...TypeScale.bodyBold, color: BrandColors.textHeading },
  choiceBody: { ...TypeScale.bodySmall, color: BrandColors.textSecondary },
  kbCard: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: BrandColors.white,
    borderWidth: 1,
    borderColor: BrandColors.border,
    borderRadius: Radii.card,
    padding: 16,
  },
  kbTitle: { ...TypeScale.h4, color: BrandColors.textHeading },
  kbBody: { ...TypeScale.bodySmall, color: BrandColors.textSecondary, textAlign: 'center' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BrandColors.white,
    borderWidth: 1,
    borderColor: BrandColors.border,
    borderRadius: Radii.card,
    padding: 14,
  },
  switchText: { flex: 1, gap: 2 },
  switchTitle: { ...TypeScale.bodyBold, color: BrandColors.textHeading },
  switchBody: { ...TypeScale.bodySmall, color: BrandColors.textSecondary },
  reviewRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 12,
  },
  reviewLabel: { ...TypeScale.label, color: BrandColors.textMuted, width: 90 },
  reviewValue: { ...TypeScale.body, color: BrandColors.textHeading, flex: 1 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BrandColors.border,
    backgroundColor: BrandColors.white,
  },
});
