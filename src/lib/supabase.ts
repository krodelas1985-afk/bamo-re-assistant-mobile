// Polyfill the WHATWG URL API on native (Hermes lacks it). supabase-js parses
// URLs during auth init; without this, signInWithPassword hangs forever on the
// device (web is unaffected — it has a native URL). Must load before supabase-js.
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const isBrowser = typeof window !== 'undefined';

/**
 * SSR-safe storage. Expo web statically renders routes in Node, where neither
 * `window` nor AsyncStorage's web shim exist — so on web we use localStorage
 * guarded by an `isBrowser` check that no-ops during server render. Native uses
 * AsyncStorage directly.
 */
const authStorage =
  Platform.OS === 'web'
    ? {
        getItem: (key: string) => (isBrowser ? window.localStorage.getItem(key) : null),
        setItem: (key: string, value: string) => {
          if (isBrowser) window.localStorage.setItem(key, value);
        },
        removeItem: (key: string) => {
          if (isBrowser) window.localStorage.removeItem(key);
        },
      }
    : AsyncStorage;

/** Shared BaMo Supabase project (same DB as Campaign Engine / Ads Manager). */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
