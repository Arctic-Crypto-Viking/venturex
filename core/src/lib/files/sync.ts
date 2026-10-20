import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { normaliseUpload } from "@core/lib/social/render";
import { SOCIAL_BUCKET, uploadPostImage } from "@core/lib/social/storage";
import type { MediaItem } from "@core/lib/social/types";
import { getFileProvider } from "./providers";
import { LIBRARY_BUCKET, thumbPath } from "./storage";
import { FileProviderError, POSTABLE_VIDEO_MIME, kindOf, type ChangeSet, type ConnectedSource, type RemoteFile, type RemoteFolder } from "./types";
import type { ChosenFolder, Item, Source } from "./db";

/**
 * The Library worker (docs/FILES.md §5), one step of the cron that also drives
 * Social Manager, with the service role. Three jobs, each idempotent, each with
 * a small budget so a run stays well inside a Vercel function's minute:
 *
 *  1. sync: sources due (files_claim_sync is the lock) → the provider's changes
 *     since the cursor → items and folders upserted, removed ones marked
 *     `missing`, the cursor stored. A dead token → health `reconnect`, nothing else.
 *  2. thumbnails: active items without one → a 640 px JPEG in the private bucket
 *     (from the provider when it has one, else from the original); three tries.
 *  3. staging: Social drafts that point at a Library file (slots.library_item)
 *     and have no media yet → the original is fetched once and written to the
 *     public `social` bucket as the post's own file (JPEG cropped to the format,
 *     or the video as it is), so approval freezes a copy, not a link (S2).
 */
export type FilesReport = {
  at: string; synced: number; syncFailed: number; items: number; removed: number;
  thumbs: number; thumbFailed: number; staged: number; stageFailed: number; errors: string[];
};

const SYNC_BUDGET = 3;
const THUMB_BUDGET = 12;
const STAGE_BUDGET = 6;
const THUMB_MAX_ORIGINAL = 25 * 1024 * 1024;
const VIDEO_MAX_BYTES = 300 * 1024 * 1024;

type SourceRow = Source & { cursor: string | null };
const SOURCE_ALL = "id, account_id, actor_id, provider, external_id, label, scopes, token_expires_at, health, health_note, folders, sync_every_minutes, last_synced_at, sync_requested_at, syncing_at, last_error, connected_by, connected_at, disconnected_at, created_at, updated_at, cursor";

export async function runFilesWorker(admin: SupabaseClient, now = new Date()): Promise<FilesReport> {
  const r: FilesReport = { at: now.toISOString(), synced: 0, syncFailed: 0, items: 0, removed: 0, thumbs: 0, thumbFailed: 0, staged: 0, stageFailed: 0, errors: [] };
  const note = (where: string, e: unknown) => { const m = e instanceof Error ? e.message : String(e); console.error(`files worker: ${where}`, m); r.errors.push(`${where}: ${m}`.slice(0, 300)); };
  try { await syncDue(admin, now, r); } catch (e) { note("sync", e); }
  try { await makeThumbnails(admin, r); } catch (e) { note("thumbs", e); }
  try { await stageDrafts(admin, r); } catch (e) { note("stage", e); }
  return r;
}

// ------------------------------------------------------------------ tokens

/**
 * A usable access token for a source: read from Vault, refreshed first when it
 * ends within five minutes (and stored back). Without a refresh token an ended
 * token means the person must connect again.
 */
export async function connectedSource(admin: SupabaseClient, source: Pick<Source, "id" | "provider" | "token_expires_at">): Promise<ConnectedSource> {
  if (source.provider === "upload") throw new Error("uploads have no token");
  const { data, error } = await admin.rpc("files_tokens", { p_source: source.id });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { token: string | null; refresh: string | null } | undefined;
  if (!row?.token) throw new FileProviderError("No token stored for this source.", { auth: true });
  const ends = source.token_expires_at ? new Date(source.token_expires_at).getTime() : Infinity;
  if (ends - Date.now() > 5 * 60_000) return { id: source.id, token: row.token };
  if (!row.refresh) throw new FileProviderError("The connection has ended.", { auth: true });
  const fresh = await getFileProvider(source.provider).refresh(row.refresh);
  await admin.rpc("files_store_token", { p_source: source.id, p_token: fresh.token, p_expires_at: fresh.expiresAt?.toISOString() ?? null });
  return { id: source.id, token: fresh.token };
}

async function markReconnect(admin: SupabaseClient, sourceId: string, why: string) {
  await admin.from("file_sources").update({ health: "reconnect", health_note: why.slice(0, 300), syncing_at: null, last_error: why.slice(0, 500) }).eq("id", sourceId);
}

// ------------------------------------------------------------------ 1. sync

async function syncDue(admin: SupabaseClient, now: Date, r: FilesReport) {
  const { data, error } = await admin.rpc("files_claim_sync", { p_limit: SYNC_BUDGET });
  if (error) throw error;
  for (const row of (data ?? []) as SourceRow[]) {
    try {
      const provider = getFileProvider(row.provider);
      const src = await connectedSource(admin, row);
      const roots = provider.selection === "folders" ? (row.folders ?? []).map((f) => f.id) : [];
      if (provider.selection === "folders" && roots.length === 0) {
        await admin.from("file_sources").update({ syncing_at: null, last_synced_at: now.toISOString(), last_error: null }).eq("id", row.id);
        continue;
      }
      const set = await provider.changes(src, row.cursor, roots);
      const n = await applyChanges(admin, row, set);
      r.items += n.items; r.removed += n.removed;
      await admin.from("file_sources").update({
        cursor: set.cursor, syncing_at: null, last_synced_at: now.toISOString(), last_error: n.error,
        // more pages: ask for another run straight away
        sync_requested_at: set.more ? new Date(now.getTime() + 1000).toISOString() : row.sync_requested_at,
      }).eq("id", row.id);
      r.synced++;
    } catch (e) {
      r.syncFailed++;
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof FileProviderError && e.auth) await markReconnect(admin, row.id, msg);
      else await admin.from("file_sources").update({ syncing_at: null, last_synced_at: now.toISOString(), last_error: msg.slice(0, 500) }).eq("id", row.id);
      r.errors.push(`sync ${row.id}: ${msg}`.slice(0, 300));
    }
  }
}

/** Folders and files of one change set → rows. Returns what landed and the plan error, if the limit stopped it. */
export async function applyChanges(admin: SupabaseClient, source: Pick<Source, "id" | "account_id" | "actor_id" | "folders" | "provider">, set: ChangeSet): Promise<{ items: number; removed: number; error: string | null }> {
  let removed = 0; let items = 0; let error: string | null = null;

  // folders: the chosen roots first, then what the sync saw; parents resolved in a second pass
  const roots: RemoteFolder[] = (source.folders ?? []).map((f: ChosenFolder) => ({ externalId: f.id, name: f.name, path: f.path, parentExternalId: null }));
  const folderRows = [...roots, ...set.folders].map((f) => ({ account_id: source.account_id, source_id: source.id, external_id: f.externalId, name: f.name.slice(0, 200), path: f.path.slice(0, 1000) }));
  if (folderRows.length) {
    const { error: e } = await admin.from("file_folders").upsert(folderRows, { onConflict: "source_id,external_id" });
    if (e) throw new Error(`folders: ${e.message}`);
  }
  const { data: known } = await admin.from("file_folders").select("id, external_id").eq("source_id", source.id);
  const folderId = new Map((known ?? []).map((f) => [f.external_id as string, f.id as string]));
  const parentFix = set.folders.filter((f) => f.parentExternalId && folderId.has(f.parentExternalId) && folderId.has(f.externalId))
    .map((f) => ({ id: folderId.get(f.externalId)!, parent_id: folderId.get(f.parentExternalId!)! }));
  for (const p of parentFix) await admin.from("file_folders").update({ parent_id: p.parent_id }).eq("id", p.id);

  // removals: by id (Drive), by path (Dropbox: a deleted entry carries only its path)
  const gone = set.files.filter((f) => f.removed).map((f) => f.externalId);
  if (gone.length) {
    const { data } = await admin.from("file_items").update({ status: "missing" }).eq("source_id", source.id).in("external_id", gone).neq("status", "missing").select("id");
    removed += data?.length ?? 0;
  }
  for (const p of set.removedPaths) {
    const { data } = await admin.from("file_items").update({ status: "missing" }).eq("source_id", source.id).neq("status", "missing").or(`path.eq.${quote(p)},path.like.${quote(p + "/%")}`).select("id");
    removed += data?.length ?? 0;
  }

  // files, in chunks so the plan's limit stops late, not early
  const live = set.files.filter((f) => !f.removed);
  for (let i = 0; i < live.length; i += 50) {
    const chunk = live.slice(i, i + 50);
    const rows = chunk.map((f) => itemRow(source, f, folderId));
    const { data, error: e } = await admin.from("file_items").upsert(rows, { onConflict: "source_id,external_id" }).select("id");
    if (e) { error = e.message.slice(0, 300); break; }
    items += data?.length ?? 0;
    // a file that came back after being missing
    await admin.from("file_items").update({ status: "active" }).eq("source_id", source.id).eq("status", "missing").in("external_id", chunk.map((f) => f.externalId));
  }
  return { items, removed, error };
}

const quote = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

function itemRow(source: Pick<Source, "id" | "account_id" | "actor_id">, f: RemoteFile, folderId: Map<string, string>) {
  return {
    account_id: source.account_id, actor_id: source.actor_id, source_id: source.id,
    folder_id: f.parentExternalId ? folderId.get(f.parentExternalId) ?? null : null,
    external_id: f.externalId, name: f.name.slice(0, 300), path: f.path, kind: kindOf(f.mime, f.name), mime: f.mime, bytes: f.bytes,
    width: f.width, height: f.height, duration_s: f.durationS, taken_at: f.takenAt, modified_at: f.modifiedAt, rev: f.rev,
  };
}

/** Files the person picked in Google's Picker → described by the provider → rows. Called from the Library action, as the service. */
export async function indexPicked(admin: SupabaseClient, source: SourceRow, externalIds: string[]): Promise<{ items: number; error: string | null }> {
  const provider = getFileProvider(source.provider);
  const src = await connectedSource(admin, source);
  const files = await provider.describe(src, externalIds);
  // a first cursor, so later changes to these files arrive through the sync
  let cursor = source.cursor;
  if (!cursor) cursor = (await provider.changes(src, null, [])).cursor;
  const n = await applyChanges(admin, source, { files, folders: [], removedPaths: [], cursor, more: false });
  await admin.from("file_sources").update({ cursor, last_error: n.error }).eq("id", source.id);
  return { items: n.items, error: n.error };
}

// ------------------------------------------------------------------ 2. thumbnails

async function makeThumbnails(admin: SupabaseClient, r: FilesReport) {
  const { data } = await admin.from("file_items").select("id, account_id, source_id, external_id, name, kind, mime, bytes, width, height, thumb_tries")
    .eq("status", "active").is("thumb_path", null).in("kind", ["image", "video"]).lt("thumb_tries", 3).order("created_at").limit(THUMB_BUDGET);
  const items = (data ?? []) as Array<Pick<Item, "id" | "account_id" | "source_id" | "external_id" | "name" | "kind" | "mime" | "bytes" | "width" | "height" | "thumb_tries">>;
  if (!items.length) return;
  const sourceIds = Array.from(new Set(items.map((i) => i.source_id)));
  const { data: srcs } = await admin.from("file_sources").select(SOURCE_ALL).in("id", sourceIds);
  const sources = new Map(((srcs ?? []) as SourceRow[]).map((s) => [s.id, s]));
  const tokens = new Map<string, ConnectedSource>();

  for (const item of items) {
    try {
      const source = sources.get(item.source_id);
      if (!source) throw new Error("source is gone");
      let buf: Buffer | null = null;
      let original: Buffer | null = null;
      if (source.provider === "upload") {
        if (item.kind === "image") original = await downloadLibrary(admin, item.external_id);
      } else {
        let src = tokens.get(source.id);
        if (!src) { src = await connectedSource(admin, source); tokens.set(source.id, src); }
        const provider = getFileProvider(source.provider);
        buf = await provider.thumbnail(src, { externalId: item.external_id, mime: item.mime, name: item.name });
        if (!buf && item.kind === "image" && (item.bytes ?? 0) <= THUMB_MAX_ORIGINAL) original = (await provider.download(src, item.external_id)).body;
      }
      if (!buf && !original) throw new Error("no thumbnail available");
      const source_img = sharp(original ?? buf!).rotate();
      const meta = original ? await source_img.metadata() : null;
      const jpeg = await source_img.resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      const dims = await sharp(jpeg).metadata();
      const path = thumbPath(item.account_id, item.id);
      const { error } = await admin.storage.from(LIBRARY_BUCKET).upload(path, jpeg, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
      if (error) throw new Error(error.message);
      const patch: Record<string, unknown> = { thumb_path: path };
      if (!item.width || !item.height) {
        patch.width = meta?.width ?? dims.width ?? null;
        patch.height = meta?.height ?? dims.height ?? null;
      }
      await admin.from("file_items").update(patch).eq("id", item.id);
      r.thumbs++;
    } catch (e) {
      r.thumbFailed++;
      await admin.from("file_items").update({ thumb_tries: item.thumb_tries + 1 }).eq("id", item.id);
      r.errors.push(`thumb ${item.id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
    }
  }
}

async function downloadLibrary(admin: SupabaseClient, objectPath: string): Promise<Buffer> {
  const { data, error } = await admin.storage.from(LIBRARY_BUCKET).download(objectPath);
  if (error || !data) throw new Error(`library download: ${error?.message ?? "no data"}`);
  return Buffer.from(await data.arrayBuffer());
}

/** The original bytes of an item, from wherever it lives. */
export async function fetchOriginal(admin: SupabaseClient, item: Pick<Item, "source_id" | "external_id" | "mime">): Promise<{ body: Buffer; mime: string | null }> {
  const { data } = await admin.from("file_sources").select(SOURCE_ALL).eq("id", item.source_id).maybeSingle();
  const source = data as SourceRow | null;
  if (!source) throw new Error("source is gone");
  if (source.provider === "upload") return { body: await downloadLibrary(admin, item.external_id), mime: item.mime };
  const src = await connectedSource(admin, source);
  return getFileProvider(source.provider).download(src, item.external_id);
}

// ------------------------------------------------------------------ 3. staging

type DraftRow = { id: string; account_id: string; format: "feed_4x5" | "square" | "story_9x16" | "reel_cover" | "carousel_page"; kind: "image" | "video"; slots: Record<string, string>; media: MediaItem[] };

/** Make a Social draft's media from the Library file it points at. Exported for the single-post path (done in the action, synchronously). */
export async function stagePost(admin: SupabaseClient, post: DraftRow): Promise<MediaItem> {
  const itemId = post.slots?.library_item;
  if (!itemId) throw new Error("the post names no Library file");
  const { data } = await admin.from("file_items").select("id, source_id, external_id, mime, kind, bytes, status").eq("id", itemId).maybeSingle();
  const item = data as (Pick<Item, "id" | "source_id" | "external_id" | "mime" | "kind" | "bytes" | "status">) | null;
  if (!item || item.status === "missing") throw new Error("That file is no longer available at its source.");
  const { body, mime } = await fetchOriginal(admin, item);
  let media: MediaItem;
  if (post.kind === "video") {
    const m = (item.mime ?? mime ?? "").toLowerCase();
    if (!POSTABLE_VIDEO_MIME.has(m)) throw new Error("Instagram takes MP4 or MOV video only.");
    if (body.byteLength > VIDEO_MAX_BYTES) throw new Error("The video is over 300 MB, Instagram's limit.");
    const ext = m === "video/quicktime" ? "mov" : "mp4";
    const objectPath = `${post.account_id}/${post.id}/1-${Date.now().toString(36)}.${ext}`;
    const { error } = await admin.storage.from(SOCIAL_BUCKET).upload(objectPath, body, { contentType: m, upsert: true, cacheControl: "31536000" });
    if (error) throw new Error(`storage: ${error.message}`);
    const { data: pub } = admin.storage.from(SOCIAL_BUCKET).getPublicUrl(objectPath);
    media = { url: pub.publicUrl, kind: "video", bytes: body.byteLength };
  } else {
    const out = await normaliseUpload(body, post.format);
    media = await uploadPostImage(admin, post.account_id, post.id, 1, out.jpeg, out.width, out.height);
  }
  const { error } = await admin.from("social_posts").update({ media: [media], slots: { ...post.slots, stage_error: undefined } }).eq("id", post.id).eq("status", "draft");
  if (error) throw new Error(error.message);
  await admin.rpc("files_mark_used", { p_item: item.id, p_purpose: "social_post", p_ref: post.id });
  return media;
}

async function stageDrafts(admin: SupabaseClient, r: FilesReport) {
  const { data } = await admin.from("social_posts").select("id, account_id, format, kind, slots, media")
    .eq("status", "draft").eq("media", "[]").not("slots->>library_item", "is", null).is("slots->>stage_error", null)
    .order("created_at").limit(STAGE_BUDGET);
  for (const post of (data ?? []) as DraftRow[]) {
    try {
      await stagePost(admin, post);
      r.staged++;
    } catch (e) {
      r.stageFailed++;
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      await admin.from("social_posts").update({ slots: { ...post.slots, stage_error: msg } }).eq("id", post.id).eq("status", "draft");
      r.errors.push(`stage ${post.id}: ${msg}`.slice(0, 300));
    }
  }
}
