import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Push registration for the RE AI Assistant. On login we ask permission, mint an
 * Expo push token, and upsert it into public.push_tokens (RLS-scoped to the
 * user). On sign-out we delete this device's row so a shared handset never leaks
 * the next user's leads. Delivery is driven server-side by the push-dispatch
 * edge function; this file only concerns token lifecycle + tap routing.
 *
 * Registration reports *why* it failed rather than swallowing it. As of
 * 2026-08-01 only 1 of 9 active users had a token and none had registered since
 * 2026-07-10 across three APKs — the old bare `catch {}` meant there was no way
 * to tell a denied permission from a missing FCM key. The outcome is stored
 * locally and surfaced in Settings so a tester can read it off the handset.
 *
 * The two token calls are deliberately separate: `getDevicePushTokenAsync`
 * (native FCM) failing points at google-services.json / Play Services on the
 * device, while `getExpoPushTokenAsync` failing after a good FCM token points at
 * Expo's backend — typically the FCM V1 service account key missing from the EAS
 * project.
 */

const ANDROID_CHANNELS: { id: string; name: string; importance: number }[] = [
  { id: 'leads', name: 'Leads', importance: Notifications.AndroidImportance.HIGH },
  { id: 'appointments', name: 'Appointments', importance: Notifications.AndroidImportance.HIGH },
  { id: 'general', name: 'General', importance: Notifications.AndroidImportance.DEFAULT },
];

export async function setupAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  for (const c of ANDROID_CHANNELS) {
    await Notifications.setNotificationChannelAsync(c.id, {
      name: c.name,
      importance: c.importance,
      lightColor: '#E67E22',
    });
  }
}

function easProjectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

/** Stable per-install identifier so re-registering updates the same row. */
function deviceKey(): string {
  return `${Device.osName ?? 'device'}:${Device.modelName ?? 'x'}:${Device.osBuildId ?? Device.osInternalBuildId ?? 'na'}`.slice(
    0,
    120,
  );
}

/**
 * Where registration stopped. `registered` is the only success; everything else
 * names the layer that failed so Settings can show it without a debugger.
 */
export type PushStage =
  | 'registered'
  | 'not_a_device'
  | 'permission_denied'
  | 'no_project_id'
  | 'fcm_token_failed'
  | 'expo_token_failed'
  | 'db_write_failed';

export type PushDiagnostic = {
  stage: PushStage;
  /** Human-readable cause — the thrown message, or what we checked. */
  detail: string;
  /** Truncated token, enough to confirm identity without pasting a secret. */
  tokenPreview?: string;
  /** ISO timestamp of the attempt. */
  at: string;
};

const DIAGNOSTIC_KEY = 'bamo.push.lastDiagnostic';

async function record(diag: PushDiagnostic): Promise<PushDiagnostic> {
  if (diag.stage !== 'registered') {
    console.warn(`[push] registration stopped at ${diag.stage}: ${diag.detail}`);
  }
  try {
    await AsyncStorage.setItem(DIAGNOSTIC_KEY, JSON.stringify(diag));
  } catch {
    // storage is itself best-effort; the console line above still landed
  }
  return diag;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'unknown error';
}

/** Last registration outcome on this device, or null if it never ran. */
export async function getLastPushDiagnostic(): Promise<PushDiagnostic | null> {
  try {
    const raw = await AsyncStorage.getItem(DIAGNOSTIC_KEY);
    return raw ? (JSON.parse(raw) as PushDiagnostic) : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort: request permission, mint the token, persist it. Never throws —
 * auth and app start must not depend on push — but always returns (and stores)
 * the reason it stopped.
 */
export async function registerForPushNotifications(userId: string): Promise<PushDiagnostic> {
  const at = new Date().toISOString();

  try {
    await setupAndroidChannels();
  } catch (err) {
    // Channel setup is not fatal, but on Android 13+ no channel means the OS
    // never shows the permission prompt — worth knowing about.
    console.warn(`[push] channel setup failed: ${messageOf(err)}`);
  }

  if (!Device.isDevice) {
    return record({ stage: 'not_a_device', detail: 'Simulator or web — push is device-only.', at });
  }

  let status: Notifications.PermissionStatus;
  try {
    const existing = await Notifications.getPermissionsAsync();
    status = existing.granted ? existing.status : (await Notifications.requestPermissionsAsync()).status;
  } catch (err) {
    return record({ stage: 'permission_denied', detail: `Permission check failed: ${messageOf(err)}`, at });
  }
  if (status !== 'granted') {
    return record({
      stage: 'permission_denied',
      detail: `Notification permission is "${status}". Enable it for BaMo in phone settings.`,
      at,
    });
  }

  const projectId = easProjectId();
  if (!projectId) {
    return record({
      stage: 'no_project_id',
      detail: 'No EAS projectId in app config — expo.extra.eas.projectId is missing from this build.',
      at,
    });
  }

  // Native FCM token first, so a failure here is unambiguously device-side.
  try {
    await Notifications.getDevicePushTokenAsync();
  } catch (err) {
    return record({
      stage: 'fcm_token_failed',
      detail: `Android/FCM token failed: ${messageOf(err)}. Check google-services.json and Play Services on this device.`,
      at,
    });
  }

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (err) {
    return record({
      stage: 'expo_token_failed',
      detail: `Expo rejected the token request: ${messageOf(err)}. FCM V1 key may be missing from the EAS project, or the device is offline.`,
      at,
    });
  }

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: token,
      platform: Platform.OS,
      device_id: deviceKey(),
      updated_at: at,
    },
    { onConflict: 'user_id,device_id' },
  );
  if (error) {
    return record({
      stage: 'db_write_failed',
      detail: `Saving the token failed: ${error.message}`,
      tokenPreview: token.slice(0, 24),
      at,
    });
  }

  return record({ stage: 'registered', detail: 'Token saved.', tokenPreview: token.slice(0, 24), at });
}

/** Remove this device's token (call before sign-out, while still authenticated). */
export async function removeMyPushToken(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    await supabase.from('push_tokens').delete().eq('device_id', deviceKey());
  } catch {
    // ignore
  }
}
