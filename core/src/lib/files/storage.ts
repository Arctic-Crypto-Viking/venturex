import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The PRIVATE bucket of migration 028. Nothing in it has a public URL: screens
 * read thumbnails and originals through signed URLs made on the server for the
 * member's own client (RLS decides), and a post that uses a file gets its own
 * copy in the public `social` bucket at that moment.
 */
export const LIBRARY_BUCKET = "library";

export const thumbPath = (accountId: string, itemId: string) => `${accountId}/thumbs/${itemId}.jpg`;
export const uploadPath = (accountId: string, itemId: string, ext: string) => `${accountId}/files/${itemId}.${ext}`;

/** Signed URLs for many paths at once (one request), an hour long; missing or refused paths come back null. */
export async function signedUrls(supabase: SupabaseClient, paths: string[], ttlSeconds = 3600): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (!unique.length) return out;
  const { data } = await supabase.storage.from(LIBRARY_BUCKET).createSignedUrls(unique, ttlSeconds);
  for (const row of data ?? []) if (row.signedUrl && row.path) out.set(row.path, row.signedUrl);
  return out;
}

export async function removeLibraryFiles(supabase: SupabaseClient, paths: string[]): Promise<void> {
  const list = paths.filter(Boolean);
  if (list.length) await supabase.storage.from(LIBRARY_BUCKET).remove(list);
}
