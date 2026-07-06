import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking } from 'react-native';

/**
 * Contact-channel helpers shared by the Leads list and the Lead Profile screen.
 * All channels open the phone's own provider apps via deep links — the app has
 * no in-app messaging.
 */

// One-time flag: agent has seen the "this opens your FB Page inbox" explainer.
const FB_INBOX_HINT_KEY = 'bamo.leads.fbInboxHintSeen';

function openUrl(url: string) {
  Linking.openURL(url).catch(() =>
    Alert.alert('Could not open', 'No app available to handle this.'),
  );
}

/**
 * Messenger leads open the client's Facebook Page inbox at this conversation
 * (Meta Business Suite). This requires the client's Page ID (fbPageId) + the
 * lead's PSID (messengerId); the signed-in agent must hold a "Messages" role on
 * that Page for the thread to load. A bare m.me/<PSID> link does NOT work —
 * PSIDs aren't personal profiles, so we route through the Page inbox instead.
 */
export function messengerInboxUrl(
  fbPageId: string | null,
  messengerId: string | null,
): string | null {
  if (!fbPageId || !messengerId) return null;
  return (
    `https://business.facebook.com/latest/inbox/all/?asset_id=${fbPageId}` +
    `&selected_item_id=${messengerId}&thread_type=FB_MESSAGE`
  );
}

/**
 * Open a lead's Messenger conversation in the client's FB Page inbox.
 * First time, explain that the thread lives in the client's Facebook Page — so
 * if it doesn't load the agent can self-diagnose it as missing Page "Messages"
 * access rather than a bug. Shown once, then remembered.
 */
export function openMessengerThread(fbPageId: string | null, messengerId: string | null) {
  const url = messengerInboxUrl(fbPageId, messengerId);
  if (!url) return;
  AsyncStorage.getItem(FB_INBOX_HINT_KEY).then((seen) => {
    if (seen) {
      openUrl(url);
      return;
    }
    Alert.alert(
      'Opens your Facebook Page inbox',
      "This lead messaged your Facebook Page, so the reply opens in Meta Business Suite. " +
        "If the conversation doesn't load, ask your workspace admin to give you " +
        '“Messages” access to the Page.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open inbox',
          onPress: () => {
            AsyncStorage.setItem(FB_INBOX_HINT_KEY, '1').catch(() => {});
            openUrl(url);
          },
        },
      ],
    );
  });
}

const cleanPhone = (phone: string) => phone.replace(/\s+/g, '');

export function openCall(phone: string) {
  openUrl(`tel:${cleanPhone(phone)}`);
}

export function openSms(phone: string) {
  openUrl(`sms:${cleanPhone(phone)}`);
}

export function openEmail(email: string) {
  openUrl(`mailto:${email.trim()}`);
}
