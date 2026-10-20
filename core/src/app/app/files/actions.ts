"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@core/lib/supabase/admin";
import { formatFor, ITEM_COLUMNS, type Item } from "@core/lib/files/db";
import { getFileProvider } from "@core/lib/files/providers";
import { LIBRARY_BUCKET, removeLibraryFiles, uploadPath } from "@core/lib/files/storage";
import { connectedSource, indexPicked, stagePost } from "@core/lib/files/sync";
import { kindOf, mimeFromName, type RemoteFolder } from "@core/lib/files/types";
import { ensureBrandKit } from "@core/lib/social/db";
import { colourFromLogo } from "@core/lib/social/render";
import { FILES_PATH, loadFiles, ownSource, str, UUID } from "./context";

const back = (path: string, q: Record<string, string>) => {
  const u = new URLSearchParams(q);
  redirect(`${path}?${u.toString()}`);
};

// ------------------------------------------------------------------ uploads

export type UploadResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * The browser put a file at <account>/files/<uuid>.<ext> in the private bucket
 * (RLS let it, so it is the member's own folder); this records it as an item of
 * the account's upload source, in an album (a folder) when one was named. The
 * thumbnail comes from the worker within the minute.
 */
export async function registerUploadAction(input: { path: string; name: string; mime: string | null; bytes: number; width: number | null; height: number | null; album: string }): Promise<UploadResult> {
  const ctx = await loadFiles();
  const t = ctx.dict.files;
  const path = String(input.path ?? "");
  if (!path.startsWith(`${ctx.account.id}/files/`) || path.includes("..")) return { ok: false, error: t.upload.failed.replace("{name}", input.name) };
  const { data: sourceId, error: se } = await ctx.supabase.rpc("files_upload_source", { p_account: ctx.account.id });
  if (se || !sourceId) return { ok: false, error: se?.message ?? "source" };
  let folderId: string | null = null;
  const album = String(input.album ?? "").trim().slice(0, 200);
  if (album) {
    const key = album.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "album";
    const { data: existing } = await ctx.supabase.from("file_folders").select("id").eq("source_id", sourceId).eq("external_id", key).maybeSingle();
    if (existing) folderId = existing.id as string;
    else {
      const { data: made } = await ctx.supabase.from("file_folders").insert({ account_id: ctx.account.id, source_id: sourceId, external_id: key, name: album, path: album }).select("id").single();
      folderId = (made?.id as string) ?? null;
    }
  }
  const name = String(input.name ?? "file").slice(0, 300);
  const mime = input.mime || mimeFromName(name);
  const { data, error } = await ctx.supabase.from("file_items").insert({
    account_id: ctx.account.id, actor_id: ctx.actor.id, source_id: sourceId, folder_id: folderId, external_id: path, name, path: null,
    kind: kindOf(mime, name), mime, bytes: Math.max(0, Math.floor(Number(input.bytes) || 0)) || null,
    width: input.width ?? null, height: input.height ?? null, modified_at: new Date().toISOString(),
  }).select("id").single();
  if (error || !data) {
    await removeLibraryFiles(ctx.supabase, [path]).catch(() => {});
    return { ok: false, error: error?.message ?? "insert" };
  }
  revalidatePath(FILES_PATH);
  return { ok: true, id: data.id as string };
}

/** The place the browser uploads to, so the path shape is decided in one place. */
export async function uploadTargetAction(ext: string): Promise<{ bucket: string; path: string; id: string }> {
  const ctx = await loadFiles();
  const id = crypto.randomUUID();
  const safe = ext.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  return { bucket: LIBRARY_BUCKET, path: uploadPath(ctx.account.id, id, safe), id };
}

// ------------------------------------------------------------------ items

export async function saveItemAction(fd: FormData): Promise<void> {
  const ctx = await loadFiles();
  const id = str(fd, "item");
  if (!UUID.test(id)) redirect(FILES_PATH);
  const tags = str(fd, "tags").split(/[,\n]+/).map((s) => s.trim().slice(0, 40)).filter(Boolean).slice(0, 30);
  const note = str(fd, "note").slice(0, 500) || null;
  const { error } = await ctx.supabase.from("file_items").update({ tags, note }).eq("id", id).eq("account_id", ctx.account.id);
  revalidatePath(`${FILES_PATH}/${id}`);
  back(`${FILES_PATH}/${id}`, error ? { error: error.message.slice(0, 200) } : { saved: "1" });
}

export async function setItemStatusAction(fd: FormData): Promise<void> {
  const ctx = await loadFiles();
  const id = str(fd, "item");
  const status = str(fd, "status") === "hidden" ? "hidden" : "active";
  if (!UUID.test(id)) redirect(FILES_PATH);
  await ctx.supabase.from("file_items").update({ status }).eq("id", id).eq("account_id", ctx.account.id).neq("status", "missing");
  revalidatePath(FILES_PATH);
  redirect(`${FILES_PATH}/${id}`);
}

/** Delete: the row and, for an upload, the original and the thumbnail. A cloud file stays where it lives. */
export async function deleteItemAction(fd: FormData): Promise<void> {
  const ctx = await loadFiles();
  const id = str(fd, "item");
  if (!UUID.test(id)) redirect(FILES_PATH);
  const { data } = await ctx.supabase.from("file_items").select(ITEM_COLUMNS).eq("id", id).eq("account_id", ctx.account.id).maybeSingle();
  const item = data as Item | null;
  if (item) {
    const src = ownSource(ctx, item.source_id);
    const paths = [item.thumb_path, src?.provider === "upload" ? item.external_id : null].filter((p): p is string => Boolean(p));
    await ctx.supabase.from("file_items").delete().eq("id", item.id);
    await removeLibraryFiles(ctx.supabase, paths).catch(() => {});
  }
  revalidatePath(FILES_PATH);
  redirect(`${FILES_PATH}?deleted=1`);
}

/**
 * One Library file → one Social draft, its media made now (the single-post path
 * stages synchronously; the month plan leaves that to the worker). Lands on
 * Social's review step, where the words and the time are set and approved.
 */
export async function useInPostAction(fd: FormData): Promise<void> {
  const ctx = await loadFiles();
  const t = ctx.dict.files.item;
  const id = str(fd, "item");
  if (!UUID.test(id)) redirect(FILES_PATH);
  const conn = ctx.connections.find((c) => c.id === str(fd, "connection"));
  if (!conn) back(`${FILES_PATH}/${id}`, { error: t.noConnection });
  const { data } = await ctx.supabase.from("file_items").select(ITEM_COLUMNS).eq("id", id).eq("account_id", ctx.account.id).eq("status", "active").maybeSingle();
  const item = data as Item | null;
  if (!item || item.kind === "other") back(`${FILES_PATH}/${id}`, { error: t.missing });
  const kit = await ensureBrandKit(ctx.supabase, ctx.account.id, ctx.actor, colourFromLogo);
  const when = new Date(Date.now() + 24 * 3_600_000);
  when.setMinutes(0, 0, 0);
  const video = item!.kind === "video";
  const { data: post, error } = await ctx.supabase.from("social_posts").insert({
    account_id: ctx.account.id, actor_id: ctx.actor.id, social_account_id: conn!.id, template_id: null,
    format: video ? "reel_cover" : formatFor(item!), kind: video ? "video" : "image",
    slots: { library_item: item!.id, library_name: item!.name },
    caption: [item!.note ?? "", kit.signature ?? ""].filter(Boolean).join("\n\n"),
    first_comment: (kit.hashtag_sets?.default ?? []).join(" ") || null,
    scheduled_for: when.toISOString(), created_by: ctx.user.id,
  }).select("id, account_id, format, kind, slots, media").single();
  if (error || !post) back(`${FILES_PATH}/${id}`, { error: (error?.message ?? "draft").slice(0, 200) });
  try {
    await stagePost(createAdminClient(), post as Parameters<typeof stagePost>[1]);
  } catch (e) {
    await ctx.supabase.from("social_posts").delete().eq("id", post!.id);
    back(`${FILES_PATH}/${id}`, { error: (e instanceof Error ? e.message : "stage").slice(0, 200) });
  }
  redirect(`/app/social/new?post=${post!.id}`);
}

// ------------------------------------------------------------------ sources

export async function syncNowAction(fd: FormData): Promise<void> {
  const ctx = await loadFiles(`${FILES_PATH}/sources`);
  const src = ownSource(ctx, str(fd, "source"));
  if (src && src.provider !== "upload") await ctx.supabase.from("file_sources").update({ sync_requested_at: new Date().toISOString() }).eq("id", src.id);
  revalidatePath(`${FILES_PATH}/sources`);
  redirect(`${FILES_PATH}/sources?requested=1`);
}

export async function disconnectSourceAction(fd: FormData): Promise<void> {
  const ctx = await loadFiles(`${FILES_PATH}/sources`);
  const src = ownSource(ctx, str(fd, "source"));
  if (!src) redirect(`${FILES_PATH}/sources`);
  const { error } = await ctx.supabase.rpc("files_disconnect", { p_source: src.id });
  revalidatePath(`${FILES_PATH}/sources`);
  back(`${FILES_PATH}/sources`, error ? { error: "save", detail: error.message.slice(0, 200) } : { disconnected: "1" });
}

/** Dropbox: the folders to follow. Items of folders no longer followed wait as hidden-from-sight `missing` rows. */
export async function saveFoldersAction(fd: FormData): Promise<void> {
  const ctx = await loadFiles(`${FILES_PATH}/sources`);
  const src = ownSource(ctx, str(fd, "source"));
  if (!src || src.provider === "upload") redirect(`${FILES_PATH}/sources`);
  const chosen = fd.getAll("folder").map(String).filter((v) => v.length > 0 && v.length < 1000);
  let names: Record<string, string> = {};
  try { names = JSON.parse(str(fd, "names") || "{}") as Record<string, string>; } catch { names = {}; }
  const folders = chosen.map((id) => ({ id, name: (names[id] ?? id.split("/").pop() ?? id).slice(0, 200), path: (names[id] ?? id).replace(/^\//, "").slice(0, 1000) }));
  const dropped = (src.folders ?? []).filter((f) => !chosen.includes(f.id)).map((f) => f.id);
  const { error } = await ctx.supabase.from("file_sources").update({ folders, sync_requested_at: new Date().toISOString() }).eq("id", src.id);
  if (!error && dropped.length) {
    const admin = createAdminClient();
    for (const root of dropped) {
      await admin.from("file_items").update({ status: "missing" }).eq("source_id", src.id).neq("status", "missing").or(`path.eq."${root}",path.like."${root}/%"`);
    }
    // the cursor of a dropped root goes with it; the next sync rebuilds the rest
    const { data } = await admin.from("file_sources").select("cursor").eq("id", src.id).maybeSingle();
    try {
      const cursors = JSON.parse((data?.cursor as string | null) ?? "{}") as Record<string, string>;
      for (const r of dropped) delete cursors[r];
      await admin.from("file_sources").update({ cursor: JSON.stringify(cursors) }).eq("id", src.id);
    } catch { /* not json: leave it */ }
  }
  revalidatePath(`${FILES_PATH}/sources`);
  back(`${FILES_PATH}/sources`, error ? { error: "save", detail: error.message.slice(0, 200) } : { folders: "1" });
}

/** The folder list for the chooser, as the service (the token never reaches the member's client). */
export async function listRemoteFolders(sourceId: string, parent: string | null): Promise<{ folders: RemoteFolder[]; error: string | null }> {
  const ctx = await loadFiles(`${FILES_PATH}/sources`);
  const src = ownSource(ctx, sourceId);
  if (!src || src.provider === "upload" || src.disconnected_at) return { folders: [], error: "source" };
  try {
    const admin = createAdminClient();
    const live = await connectedSource(admin, src);
    return { folders: await getFileProvider(src.provider).listFolders(live, parent), error: null };
  } catch (e) {
    return { folders: [], error: (e instanceof Error ? e.message : "provider").slice(0, 200) };
  }
}

/** Google: a short-lived token for the Picker in the browser (the person's own Drive consent; refresh stays in Vault). */
export async function pickerTokenAction(sourceId: string): Promise<{ token: string } | { error: string }> {
  const ctx = await loadFiles(`${FILES_PATH}/sources`);
  const src = ownSource(ctx, sourceId);
  if (!src || src.provider !== "google_drive" || src.disconnected_at) return { error: "source" };
  try {
    const live = await connectedSource(createAdminClient(), src);
    return { token: live.token };
  } catch (e) {
    return { error: (e instanceof Error ? e.message : "token").slice(0, 200) };
  }
}

/** Google: the ids the person picked → items. */
export async function indexPickedAction(sourceId: string, ids: string[]): Promise<{ items: number; error: string | null }> {
  const ctx = await loadFiles(`${FILES_PATH}/sources`);
  const src = ownSource(ctx, sourceId);
  if (!src || src.provider !== "google_drive" || src.disconnected_at) return { items: 0, error: "source" };
  const clean = ids.map(String).filter((s) => /^[A-Za-z0-9_-]{5,200}$/.test(s)).slice(0, 200);
  if (!clean.length) return { items: 0, error: null };
  const admin = createAdminClient();
  const { data } = await admin.from("file_sources").select("*").eq("id", src.id).maybeSingle();
  if (!data) return { items: 0, error: "source" };
  try {
    const r = await indexPicked(admin, data as Parameters<typeof indexPicked>[1], clean);
    revalidatePath(FILES_PATH);
    return r;
  } catch (e) {
    return { items: 0, error: (e instanceof Error ? e.message : "index").slice(0, 200) };
  }
}
