import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileKind, FileProviderKey, SourceHealth } from "./types";

/** Library (core): the rows as the screens and the worker read them. */
export type ChosenFolder = { id: string; name: string; path: string };

export type Source = {
  id: string; account_id: string; actor_id: string | null; provider: FileProviderKey; external_id: string | null; label: string | null;
  scopes: string[]; token_expires_at: string | null; health: SourceHealth; health_note: string | null; folders: ChosenFolder[];
  sync_every_minutes: number; last_synced_at: string | null; sync_requested_at: string | null; syncing_at: string | null; last_error: string | null;
  connected_by: string | null; connected_at: string; disconnected_at: string | null; created_at: string; updated_at: string;
};
export const SOURCE_COLUMNS =
  "id, account_id, actor_id, provider, external_id, label, scopes, token_expires_at, health, health_note, folders, sync_every_minutes, last_synced_at, sync_requested_at, syncing_at, last_error, connected_by, connected_at, disconnected_at, created_at, updated_at";

export type Folder = { id: string; account_id: string; source_id: string; external_id: string; parent_id: string | null; name: string; path: string; item_count: number };
export const FOLDER_COLUMNS = "id, account_id, source_id, external_id, parent_id, name, path, item_count";

export type Item = {
  id: string; account_id: string; actor_id: string | null; source_id: string; folder_id: string | null; external_id: string; name: string; path: string | null;
  kind: FileKind; mime: string | null; bytes: number | null; width: number | null; height: number | null; duration_s: number | null;
  taken_at: string | null; modified_at: string | null; rev: string | null; thumb_path: string | null; thumb_tries: number;
  status: "active" | "hidden" | "missing"; tags: string[]; note: string | null; times_used: number; last_used_at: string | null; created_at: string; updated_at: string;
};
export const ITEM_COLUMNS =
  "id, account_id, actor_id, source_id, folder_id, external_id, name, path, kind, mime, bytes, width, height, duration_s, taken_at, modified_at, rev, thumb_path, thumb_tries, status, tags, note, times_used, last_used_at, created_at, updated_at";

/** The account's sources, connected ones first (RLS scopes to the caller's memberships). */
export async function loadSources(supabase: SupabaseClient, accountId: string): Promise<Source[]> {
  const { data } = await supabase.from("file_connections").select(SOURCE_COLUMNS).eq("account_id", accountId).order("provider").order("connected_at");
  return (data ?? []) as Source[];
}

export async function loadFolders(supabase: SupabaseClient, accountId: string): Promise<Folder[]> {
  const { data } = await supabase.from("file_folders").select(FOLDER_COLUMNS).eq("account_id", accountId).order("path");
  return (data ?? []) as Folder[];
}

export type ItemFilter = { kind?: FileKind | null; folderId?: string | null; sourceId?: string | null; actorId?: string | null; status?: Item["status"] | "all"; limit?: number };

/** Items the person browses: active by default, newest shot first, the actor's and the shared ones. */
export async function loadItems(supabase: SupabaseClient, accountId: string, f: ItemFilter = {}): Promise<Item[]> {
  let q = supabase.from("file_items").select(ITEM_COLUMNS).eq("account_id", accountId);
  if (f.status !== "all") q = q.eq("status", f.status ?? "active");
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.folderId) q = q.eq("folder_id", f.folderId);
  if (f.sourceId) q = q.eq("source_id", f.sourceId);
  if (f.actorId) q = q.or(`actor_id.eq.${f.actorId},actor_id.is.null`);
  q = q.order("taken_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(f.limit ?? 400);
  const { data } = await q;
  return (data ?? []) as Item[];
}

/** Portrait enough for Instagram's 4:5 feed crop; otherwise square is the safer crop. */
export function formatFor(item: Pick<Item, "width" | "height">): "feed_4x5" | "square" {
  if (!item.width || !item.height) return "feed_4x5";
  return item.height / item.width >= 1.1 ? "feed_4x5" : "square";
}

export const PROVIDER_LABEL: Record<FileProviderKey, string> = { upload: "Uploads", dropbox: "Dropbox", google_drive: "Google Drive" };
