/**
 * The mobile app's Marketplace listings — the CRM side of Identity Standard §57.
 *
 * An agent opens the Listings tab. The app is signed in to the CRM (this
 * project), not to the Marketplace, and never holds Marketplace credentials. So
 * the app calls THIS function with its own session; this function checks who
 * that is, looks up their bamo_account_id in the CRM's own table, and asks the
 * Marketplace's `crm-bridge` for that one account's listings over a
 * §52-signed server-to-server request.
 *
 * The signature is computed in Postgres by sign_marketplace_bridge_request(),
 * with a token held in this project's Vault, so the secret never enters this
 * function. Rule 11 holds on both sides: the bamo_account_id is read from the
 * CRM's own record of the signed-in person — never from the request — and the
 * Marketplace uses it only to find the linked account.
 *
 * Read-only. Listing from the app (tap-to-list, §57.4) is a later, separate change.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MARKETPLACE_BRIDGE_URL = 'https://cbnvuergvdnfzeixbiwt.supabase.co/functions/v1/crm-bridge';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function secretKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const key = JSON.parse(keys)?.default;
      if (typeof key === 'string' && key) return key;
    } catch {
      // fall through to the legacy variable
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

/** 24 random bytes as base64url: 32 characters, inside the verifier's 16-128 bound. */
function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return j({ error: 'POST only' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return j({ error: 'Not authenticated' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) return j({ error: 'Not authenticated' }, 401);

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('bamo_account_id, is_active')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError) {
    console.error(`[marketplace-listings] profile read failed: ${profileError.message}`);
    return j({ error: 'Could not read your profile' }, 500);
  }
  if (!profile || !profile.is_active) return j({ error: 'Your account is not active' }, 403);
  if (!profile.bamo_account_id) return j({ linked: false });

  const raw = JSON.stringify({ operation: 'account_listings', bamo_account_id: profile.bamo_account_id });
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = makeNonce();

  const { data: signature, error: signError } = await admin.rpc('sign_marketplace_bridge_request', {
    p_timestamp: ts,
    p_nonce: nonce,
    p_body: raw,
  });
  if (signError || typeof signature !== 'string') {
    // Most likely the bridge token has not been minted yet. Say so plainly; the
    // app keeps showing the listings it can.
    console.error(`[marketplace-listings] signing failed: ${signError?.message ?? 'no signature'}`);
    return j({ error: 'bridge_not_configured' }, 503);
  }

  let response: Response;
  try {
    response = await fetch(MARKETPLACE_BRIDGE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bamo-caller': 'crm',
        'x-bamo-timestamp': ts,
        'x-bamo-nonce': nonce,
        'x-bamo-signature': signature,
      },
      body: raw,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return j({ error: 'marketplace_unavailable' }, 504);
  }

  if (!response.ok) {
    console.error(`[marketplace-listings] bridge answered ${response.status}`);
    return j({ error: response.status === 401 ? 'bridge_rejected' : 'marketplace_unavailable' }, 502);
  }

  return j(await response.json());
});
