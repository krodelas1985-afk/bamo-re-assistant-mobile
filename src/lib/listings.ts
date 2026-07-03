import { BadgeTone } from '@/components/ui/badge';
import { Listing } from '@/components/listing-card';
import { supabase } from '@/lib/supabase';

/** Agent-authored listings, stored in the main BaMo project (table agent_listings). */

export type ListingType = 'sale' | 'rent';
export type ListingStatus = 'draft' | 'published';

export type ListingInput = {
  title: string;
  listing_type: ListingType;
  property_type: string | null;
  price: number | null;
  lot_area: number | null;
  floor_area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  location: string | null;
  city: string | null;
  description: string | null;
  photo_urls: string[];
  status: ListingStatus;
};

type ListingRow = ListingInput & { id: string; created_at: string };

const SELECT =
  'id, title, listing_type, property_type, price, lot_area, floor_area, bedrooms, bathrooms, location, city, description, photo_urls, status, created_at';

const STATUS: Record<ListingStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'warm' },
  published: { label: 'Live', tone: 'success' },
};

function toCard(row: ListingRow): Listing {
  const place = [row.location, row.city].filter(Boolean).join(' · ') || 'Philippines';
  const s = STATUS[row.status] ?? STATUS.draft;
  return {
    id: row.id,
    title: row.title || 'Untitled listing',
    location: place,
    price: row.price ?? 0,
    bedrooms: row.bedrooms ?? 0,
    baths: row.bathrooms ?? 0,
    floorArea: row.floor_area ?? 0,
    status: s.label,
    statusTone: s.tone,
    financing: [],
    imageUrl: row.photo_urls?.[0],
  };
}

/** The current user's listings (RLS-scoped: own for agents, whole client otherwise). */
export async function fetchMyListings(): Promise<{ data: Listing[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_listings')
    .select(SELECT)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return { data: [], error: error.message };
  return { data: (data as ListingRow[]).map(toCard), error: null };
}

export async function createListing(
  clientId: string,
  userId: string,
  input: ListingInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('agent_listings')
    .insert({ ...input, client_id: clientId, created_by: userId });
  return { error: error ? error.message : null };
}

/** Upload one photo to the public `listing-photos` bucket; returns its public URL. */
export async function uploadListingPhoto(
  clientId: string,
  asset: { uri: string; base64?: string | null; mimeType?: string | null },
): Promise<{ url: string | null; error: string | null }> {
  try {
    const mime = asset.mimeType || 'image/jpeg';
    let body: Uint8Array | ArrayBuffer;
    if (asset.base64) {
      const bin = atob(asset.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      body = bytes;
    } else {
      body = await (await fetch(asset.uri)).arrayBuffer();
    }
    const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const path = `${clientId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from('listing-photos')
      .upload(path, body, { contentType: mime, upsert: false });
    if (error) return { url: null, error: error.message };
    const { data } = supabase.storage.from('listing-photos').getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (e) {
    return { url: null, error: String(e) };
  }
}

export type GeneratedListing = Partial<{
  title: string;
  property_type: string;
  listing_type: ListingType;
  price: number | null;
  lot_area: number | null;
  floor_area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  location: string;
  city: string;
  description: string;
}>;

/** Ask BayMo to draft the listing (title + description + tidied fields) from notes/fields. */
export async function generateListing(
  details: string,
  fields: Record<string, unknown>,
): Promise<{ listing: GeneratedListing | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('generate-listing', {
    body: { details, fields },
  });
  if (error) return { listing: null, error: error.message };
  if (data?.error) return { listing: null, error: String(data.error) };
  return { listing: (data?.listing as GeneratedListing) ?? {}, error: null };
}
