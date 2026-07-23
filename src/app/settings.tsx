import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, CardShadow, Radii, TypeScale } from '@/constants/brand';
import {
  DEFAULT_PREFS,
  fetchPreferences,
  NotificationPrefs,
  savePreferences,
} from '@/lib/notifications';
import {
  changePassword,
  fetchWorkspaceName,
  requestAccountDeletion,
} from '@/lib/settings';

const NOTIF_TOGGLES: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: 'lead_assigned', label: 'Lead assignments', hint: 'When a lead is assigned to you' },
  { key: 'lead_hot', label: 'Hot leads', hint: 'High-intent leads, ready to talk' },
  { key: 'lead_warm', label: 'Warm leads', hint: 'Leads warming up' },
  { key: 'appointment_reminders', label: 'Appointment reminders', hint: 'Viewings & calls, 24h and 1h before' },
  { key: 'tasks', label: 'Tasks', hint: 'When a task is assigned to you' },
  { key: 'ads_updates', label: 'Ads updates', hint: 'Campaign & report alerts' },
  { key: 'quiet_hours', label: 'Quiet hours (9 PM–7 AM)', hint: 'Hold non-urgent pushes overnight — hot leads still come through' },
];

const ROLE_LABELS: Record<string, string> = {
  baymo_admin: 'BaMo Admin',
  client_admin: 'Workspace Admin',
  agent: 'Agent',
};

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, session, signOut } = useAuth();
  const clientId = profile?.client_id ?? null;
  const userId = session?.user.id ?? null;

  const [workspace, setWorkspace] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [deleteNote, setDeleteNote] = useState('');
  const [deleteRequested, setDeleteRequested] = useState(false);

  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);

  useEffect(() => {
    if (clientId) fetchWorkspaceName().then(setWorkspace);
  }, [clientId]);

  useEffect(() => {
    fetchPreferences().then(setPrefs);
  }, []);

  const togglePref = async (key: keyof NotificationPrefs, value: boolean) => {
    const base = prefs ?? DEFAULT_PREFS;
    const next = { ...base, [key]: value };
    setPrefs(next); // optimistic
    if (userId) {
      const { error } = await savePreferences(userId, next);
      if (error) {
        setPrefs(base); // revert
        Alert.alert('Could not save', error);
      }
    }
  };

  const savePassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert('Too short', 'Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords don’t match', 'Please re-enter your new password.');
      return;
    }
    setSavingPassword(true);
    const { error } = await changePassword(newPassword);
    setSavingPassword(false);
    if (error) {
      Alert.alert('Could not update password', error);
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    Alert.alert('Password updated', 'Use your new password next time you sign in.');
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'This sends a request to the BaMo team to close your account and remove your data. It cannot be undone once processed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send request', style: 'destructive', onPress: submitDeleteRequest },
      ],
    );
  };

  const submitDeleteRequest = async () => {
    if (!clientId || !userId) return;
    const { error } = await requestAccountDeletion(clientId, userId, deleteNote.trim() || null);
    if (error) Alert.alert('Could not send', error);
    else setDeleteRequested(true);
  };

  return (
    <Screen title="Settings" onBack={() => router.back()}>
      {/* Profile */}
      <Pressable style={styles.card} onPress={() => router.push('/profile')}>
        <View style={styles.profileRow}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.profileAvatar} />
          ) : (
            <Avatar name={profile?.full_name ?? '?'} size={48} />
          )}
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{profile?.full_name ?? 'Set up your profile'}</Text>
            {workspace ? <Text style={styles.workspace}>{workspace}</Text> : null}
            {profile?.role ? (
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{ROLE_LABELS[profile.role] ?? profile.role}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.editLink}>
            <Text style={styles.editLinkText}>Edit profile</Text>
            <Ionicons name="chevron-forward" size={16} color={BrandColors.navy} />
          </View>
        </View>
      </Pressable>

      {/* Password */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Change password</Text>
        <TextField label="New password" value={newPassword} onChangeText={setNewPassword} placeholder="At least 6 characters" secureTextEntry />
        <TextField label="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter password" secureTextEntry />
        {savingPassword ? (
          <ActivityIndicator color={BrandColors.navy} />
        ) : (
          <Button label="Update password" variant="secondary" onPress={savePassword} />
        )}
      </View>

      {/* Notifications */}
      <View style={styles.card}>
        <View style={styles.rowStart}>
          <Ionicons name="notifications-outline" size={18} color={BrandColors.navy} />
          <Text style={styles.cardTitle}>Notifications</Text>
        </View>
        {prefs ? (
          NOTIF_TOGGLES.map((t) => (
            <View key={t.key} style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>{t.label}</Text>
                <Text style={styles.toggleHint}>{t.hint}</Text>
              </View>
              <Switch
                value={prefs[t.key]}
                onValueChange={(v) => togglePref(t.key, v)}
                trackColor={{ true: BrandColors.orange, false: BrandColors.borderDark }}
                thumbColor={BrandColors.white}
              />
            </View>
          ))
        ) : (
          <ActivityIndicator color={BrandColors.navy} />
        )}
        <Text style={styles.muted}>
          Also allow notifications for BaMo in your phone&apos;s settings to receive pushes.
        </Text>
      </View>

      {/* Support */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Need help?</Text>
        <Button label="Chat with BayMo" variant="secondary" onPress={() => router.push('/chat')} />
        <Button
          label="Replay BayMo intro"
          variant="secondary"
          onPress={() => router.push('/welcome?replay=1')}
        />
      </View>

      {/* Danger zone */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <Button label="Sign out" variant="secondary" onPress={signOut} />

        {deleteRequested ? (
          <Text style={styles.deleteSent}>Request sent ✔ The BaMo team will follow up with you.</Text>
        ) : (
          <>
            <TextField
              label="Tell us why (optional)"
              value={deleteNote}
              onChangeText={setDeleteNote}
              placeholder="Optional — helps us improve"
              multiline
              numberOfLines={2}
            />
            <Button label="Delete my account" variant="secondary" onPress={confirmDeleteAccount} style={styles.deleteButton} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BrandColors.white,
    ...CardShadow,
    borderRadius: Radii.card,
    padding: 16,
    gap: 10,
  },
  cardTitle: {
    ...TypeScale.h4,
    color: BrandColors.textHeading,
  },
  rowStart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  workspace: {
    ...TypeScale.bodySmall,
    color: BrandColors.textBody,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: BrandColors.cream100,
  },
  profileText: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    ...TypeScale.bodyBold,
    color: BrandColors.textHeading,
  },
  editLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  editLinkText: {
    ...TypeScale.label,
    color: BrandColors.navy,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: BrandColors.cream100,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.pill,
  },
  roleText: {
    ...TypeScale.labelSmall,
    color: BrandColors.navy,
  },
  muted: {
    ...TypeScale.bodySmall,
    color: BrandColors.textBody,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  toggleText: { flex: 1, gap: 1 },
  toggleLabel: { ...TypeScale.bodyBold, color: BrandColors.textHeading },
  toggleHint: { ...TypeScale.bodySmall, color: BrandColors.textMuted },
  deleteButton: {
    borderColor: BrandColors.error,
  },
  deleteSent: {
    ...TypeScale.bodyBold,
    color: BrandColors.success,
  },
});
