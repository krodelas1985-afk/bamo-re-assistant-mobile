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

/** Best-effort: request permission, mint the token, persist it. Never throws. */
export async function registerForPushNotifications(userId: string): Promise<void> {
  try {
    await setupAndroidChannels();
    if (!Device.isDevice) return; // no push on simulators / web

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const projectId = easProjectId();
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        expo_push_token: token,
        platform: Platform.OS,
        device_id: deviceKey(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,device_id' },
    );
  } catch {
    // swallow — push is a nice-to-have, never block auth/app start
  }
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
