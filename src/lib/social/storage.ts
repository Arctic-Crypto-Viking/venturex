import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@core/lib/env";
import type { MediaItem } from "./types";

/** The public bucket of migration 027: <account id>/<post id>/<n>.jpg — Meta fetches by URL. */
export const SOCIAL_BUCKET = "social";

export async function uploadPostImage(supabase: SupabaseClient, accountId: string, postId: string, n: number, jpeg: Buffer, width: number, height: number): Promise<MediaItem> {
  const objectPath = `${accountId}/${postId}/${n}-${Date.now().toString(36)}.jpg`;
  const { error } = await supabase.storage.from(SOCIAL_BUCKET).upload(objectPath, jpeg, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(`storage: ${error.message}`);
  const { data } = supabase.storage.from(SOCIAL_BUCKET).getPublicUrl(objectPath);
  return { url: data.publicUrl, kind: "image", width, height, bytes: jpeg.byteLength };
}

/**
 * A video the browser already put under <account>/uploads/ is moved into the post's
 * folder as it is (no transcoding here: Instagram processes it, §3). Returns the item.
 */
export async function adoptPostVideo(supabase: SupabaseClient, accountId: string, postId: string, uploadUrl: string): Promise<MediaItem> {
  const from = objectPathOf(uploadUrl);
  if (!from) throw new Error("not a bucket url");
  const ext = from.toLowerCase().endsWith(".mov") ? "mov" : "mp4";
  const to = `${accountId}/${postId}/video-${Date.now().toString(36)}.${ext}`;
  const { error } = await supabase.storage.from(SOCIAL_BUCKET).move(from, to);
  if (error) throw new Error(`storage: ${error.message}`);
  const { data } = supabase.storage.from(SOCIAL_BUCKET).getPublicUrl(to);
  return { url: data.publicUrl, kind: "video" };
}

/** "…/storage/v1/object/public/social/<path>" → "<path>", or null. */
/**
 * The browser uploads into <account>/uploads/; a post's own files live under <account>/<post>/.
 * True only for this project's public `social` bucket and this account's folder: the one check
 * before the server fetches a URL that came from the browser (a render, a preview).
 */
export function isOwnUpload(accountId: string, url: string): boolean {
  try {
    const u = new URL(url);
    return u.origin === new URL(publicEnv.supabaseUrl).origin && u.pathname.startsWith(`/storage/v1/object/public/${SOCIAL_BUCKET}/${accountId}/`);
  } catch {
    return false;
  }
}

export function objectPathOf(url: string): string | null {
  const m = url.match(new RegExp(`/object/public/${SOCIAL_BUCKET}/(.+)$`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Remove everything under <account>/<post>/ (a cancelled draft's files). */
export async function removePostFiles(supabase: SupabaseClient, accountId: string, postId: string): Promise<void> {
  const { data } = await supabase.storage.from(SOCIAL_BUCKET).list(`${accountId}/${postId}`);
  const names = (data ?? []).map((f) => `${accountId}/${postId}/${f.name}`);
  if (names.length) await supabase.storage.from(SOCIAL_BUCKET).remove(names);
}
