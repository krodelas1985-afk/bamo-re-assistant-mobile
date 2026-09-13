import { BadgeTone } from '@/components/ui/badge';
import { Listing } from '@/components/listing-card';
import { supabase } from '@/lib/supabase';

/**
 * The agent's listings as they stand on BaMo Marketplace.
 *
 * The app never talks to the Marketplace directly and holds no Marketplace
 * credentials (Identity Standard §57). It calls the CRM's `marketplace-listings`
 * Edge Function with its own session, and the CRM's server asks the Marketplace
 * for this one person's listings.
 */

/**
 * Where a published listing can be opened. The Marketplace has not yet taken
 * over bahaymo.com (the A4 cutover); change this to https://bahaymo.com then.
 */
export const MARKETPLACE_PUBLIC_URL = 'https://ba-mo-marketplace.vercel.app';

export type MarketplaceListing = {
  id: string;
  reference_code: string;
  title: string;
  status: string;
  transaction_type: 'sale' | 'rent' | string;
  price_amount: number | null;
  price_period: string | null;
  currency_code: string;
  bedrooms: number | null;
  bathrooms: number | null;
  floor_area_sqm: number | null;
  lot_area_sqm: number | null;
  city: string | null;
  province: string | null;
  public_slug: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  changes_under_review: boolean;
  photo_count: number;
  cover_url: string | null;
};

export type MarketplaceResult =
  | { linked: false }
  | {
      linked: true;
      account_status: string | null;
      display_name: string | null;
      profile_slug: string | null;
      listings: MarketplaceListing[];
    };

// Words an agent understands for where BaMo has got to with their listing.
// Nothing reads "Live" unless the Marketplace says it is published.
const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Being prepared', tone: 'neutral' },
  submitted: { label: 'In review', tone: 'info' },
  under_review: { label: 'In review', tone: 'info' },
  approved: { label: 'Approved', tone: 'info' },
  published: { label: 'Live', tone: 'success' },
  paused: { label: 'Paused', tone: 'warm' },
  unpublished: { label: 'Off market', tone: 'neutral' },
  rejected: { label: 'Needs changes', tone: 'error' },
  sold: { label: 'Sold', tone: 'neutral' },
  rented: { label: 'Rented', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
};

export type MarketplaceCard = Listing & { publicUrl: string | null };

export function toMarketplaceCard(l: MarketplaceListing): MarketplaceCard {
  const s = STATUS[l.status] ?? { label: l.status, tone: 'neutral' as BadgeTone };
  const label = l.status === 'published' && l.changes_under_review ? 'Live · update in review' : s.label;
  return {
    id: l.id,
    title: l.title || 'Untitled listing',
    location: [l.city, l.province].filter(Boolean).join(', ') || 'Philippines',
    price: l.price_amount ?? 0,
    bedrooms: l.bedrooms ?? 0,
    baths: l.bathrooms ?? 0,
    floorArea: l.floor_area_sqm ?? 0,
    status: label,
    statusTone: s.tone,
    financing: [l.transaction_type === 'rent' ? 'For rent' : 'For sale', l.reference_code],
    imageUrl: l.cover_url ?? undefined,
    publicUrl: l.public_slug ? `${MARKETPLACE_PUBLIC_URL}/property/${l.public_slug}` : null,
  };
}

export async function fetchMarketplaceListings(): Promise<{
  data: MarketplaceResult | null;
  error: string | null;
}> {
  const { data, error } = await supabase.functions.invoke('marketplace-listings', { body: {} });
  if (error) {
    // supabase-js wraps non-2xx responses; the body carries the real reason.
    let reason = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const body = ctx ? await ctx.json() : null;
      if (body?.error) reason = String(body.error);
    } catch {
      // keep the generic message
    }
    return { data: null, error: reason };
  }
  if (data?.error) return { data: null, error: String(data.error) };
  return { data: data as MarketplaceResult, error: null };
}

/** A reason code from the server, in words. */
export function marketplaceErrorText(code: string): string {
  switch (code) {
    case 'bridge_not_configured':
    case 'bridge_rejected':
      return 'BaMo is still connecting your Marketplace listings to the app.';
    case 'marketplace_unavailable':
      return 'BaMo Marketplace did not respond. Try again in a moment.';
    default:
      return 'Your Marketplace listings could not be loaded right now.';
  }
}
