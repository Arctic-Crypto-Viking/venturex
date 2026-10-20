import "server-only";

import { FileProviderError, kindOf, type ChangeSet, type ConnectedSource, type FileProvider, type RemoteFile } from "../types";

/**
 * Google Drive (docs/FILES.md F3): the non-restricted scope `drive.file`, which
 * reaches only the files the person picks in Google's own Picker (opened in the
 * browser by core/src/app/app/files/google-picker.tsx with a short-lived token
 * from the server). A picked folder does NOT unlock its contents under this
 * scope, so Drive is "pick the photos" rather than "follow a folder"; the
 * restricted `drive.readonly` would follow folders but needs Google's yearly
 * security assessment (CASA), which is the upgrade path, not the start.
 *
 * Changes: the Changes API with a page token, restricted by Google to the files
 * the app may see — so renames, edits and removals of picked files arrive the
 * same way Dropbox's do. Credentials: server-only GOOGLE_CLIENT_ID /
 * GOOGLE_CLIENT_SECRET; the Picker also needs NEXT_PUBLIC_GOOGLE_API_KEY and
 * NEXT_PUBLIC_GOOGLE_APP_ID (the Cloud project number).
 */
const AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const USERINFO = "https://www.googleapis.com/oauth2/v3/userinfo";
const DRIVE = "https://www.googleapis.com/drive/v3";
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive.file", "openid", "email"] as const;

const FILE_FIELDS = "id,name,mimeType,size,modifiedTime,md5Checksum,parents,trashed,thumbnailLink,imageMediaMetadata(width,height,time),videoMediaMetadata(width,height,durationMillis)";

function creds() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set (server only).");
  return { id, secret };
}

async function call<T>(src: ConnectedSource, url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", headers: { ...(init?.headers ?? {}), authorization: `Bearer ${src.token}` } });
  } catch (e) {
    throw new FileProviderError(e instanceof Error ? e.message : "network error", { transient: true });
  }
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } } | null)?.error?.message ?? text.slice(0, 200);
    throw new FileProviderError(`Google Drive: ${msg}`, { status: res.status, auth: res.status === 401, transient: res.status === 429 || res.status >= 500, body: json });
  }
  return json as T;
}

type GFile = {
  id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; md5Checksum?: string; parents?: string[]; trashed?: boolean; thumbnailLink?: string;
  imageMediaMetadata?: { width?: number; height?: number; time?: string }; videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string };
};

/** Google's EXIF time is "YYYY:MM:DD HH:MM:SS" (no zone); taken as UTC, which is close enough for ordering. */
function exifTime(t: string | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

function fileOf(f: GFile): RemoteFile {
  const img = f.imageMediaMetadata; const vid = f.videoMediaMetadata;
  return {
    externalId: f.id, name: f.name, path: null, parentExternalId: f.parents?.[0] ?? null, mime: f.mimeType ?? null,
    bytes: f.size ? Number(f.size) : null, width: img?.width ?? vid?.width ?? null, height: img?.height ?? vid?.height ?? null,
    durationS: vid?.durationMillis ? Number(vid.durationMillis) / 1000 : null, takenAt: exifTime(img?.time), modifiedAt: f.modifiedTime ?? null,
    rev: f.md5Checksum ?? f.modifiedTime ?? null, removed: Boolean(f.trashed),
  };
}

export const googleDrive: FileProvider = {
  key: "google_drive",
  selection: "picker",

  authUrl(state, redirectUri) {
    const { id } = creds();
    const u = new URL(AUTHORIZE);
    u.searchParams.set("client_id", id);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
    u.searchParams.set("access_type", "offline");
    u.searchParams.set("prompt", "consent");
    u.searchParams.set("include_granted_scopes", "true");
    u.searchParams.set("state", state);
    return u.toString();
  },

  async exchangeCode(code, redirectUri) {
    const { id, secret } = creds();
    const res = await fetch(TOKEN, {
      method: "POST", cache: "no-store", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const j = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error_description?: string } | null;
    if (!res.ok || !j?.access_token) throw new FileProviderError(`Google token: ${j?.error_description ?? res.status}`, { status: res.status });
    const src = { id: "", token: j.access_token };
    const me = await call<{ sub: string; email?: string; name?: string }>(src, USERINFO);
    return {
      token: j.access_token, refresh: j.refresh_token ?? null, expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null,
      profile: { externalId: me.sub, label: me.email ?? me.name ?? "Google Drive", scopes: (j.scope ?? "").split(" ").filter(Boolean) },
    };
  },

  async refresh(refreshToken) {
    const { id, secret } = creds();
    const res = await fetch(TOKEN, {
      method: "POST", cache: "no-store", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ refresh_token: refreshToken, client_id: id, client_secret: secret, grant_type: "refresh_token" }),
    });
    const j = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string; error_description?: string } | null;
    if (!res.ok || !j?.access_token) throw new FileProviderError(`Google refresh: ${j?.error_description ?? j?.error ?? res.status}`, { status: res.status, auth: j?.error === "invalid_grant" || res.status === 401 });
    return { token: j.access_token, expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null };
  },

  async listFolders() {
    return [];
  },

  /** The Changes API: Google lists only files this app may see (the picked ones), with removals. */
  async changes(src, cursor): Promise<ChangeSet> {
    let token = cursor;
    if (!token) {
      const s = await call<{ startPageToken: string }>(src, `${DRIVE}/changes/startPageToken`);
      return { files: [], folders: [], removedPaths: [], cursor: s.startPageToken, more: false };
    }
    const files: RemoteFile[] = [];
    let more = false;
    for (let page = 0; ; page++) {
      const u = new URL(`${DRIVE}/changes`);
      u.searchParams.set("pageToken", token!);
      u.searchParams.set("pageSize", "200");
      u.searchParams.set("includeRemoved", "true");
      u.searchParams.set("fields", `nextPageToken,newStartPageToken,changes(fileId,removed,file(${FILE_FIELDS}))`);
      const r = await call<{ nextPageToken?: string; newStartPageToken?: string; changes: Array<{ fileId: string; removed: boolean; file?: GFile }> }>(src, u.toString());
      for (const c of r.changes) {
        if (c.removed || !c.file) files.push({ externalId: c.fileId, name: c.fileId, path: null, parentExternalId: null, mime: null, bytes: null, width: null, height: null, durationS: null, takenAt: null, modifiedAt: null, rev: null, removed: true });
        else if (kindOf(c.file.mimeType, c.file.name) !== "other") files.push(fileOf(c.file));
      }
      if (r.nextPageToken) { token = r.nextPageToken; if (page >= 9) { more = true; break; } continue; }
      token = r.newStartPageToken ?? token;
      break;
    }
    return { files, folders: [], removedPaths: [], cursor: token!, more };
  },

  async describe(src, ids) {
    const out: RemoteFile[] = [];
    for (const id of ids.slice(0, 200)) {
      try {
        const f = await call<GFile>(src, `${DRIVE}/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(FILE_FIELDS)}`);
        if (kindOf(f.mimeType, f.name) !== "other") out.push(fileOf(f));
      } catch (e) {
        if (e instanceof FileProviderError && (e.status === 404 || e.status === 403)) continue; // not ours after all
        throw e;
      }
    }
    return out;
  },

  /** Google's own thumbnail (sized by the =s suffix) — it needs the bearer, so it is fetched here, never shown by link. */
  async thumbnail(src, file) {
    const f = await call<GFile>(src, `${DRIVE}/files/${encodeURIComponent(file.externalId)}?fields=thumbnailLink`).catch(() => null);
    const link = f?.thumbnailLink;
    if (!link) return null;
    const url = link.replace(/=s\d+(-c)?$/, "=s640");
    const res = await fetch(url, { cache: "no-store", headers: { authorization: `Bearer ${src.token}` } }).catch(() => null);
    if (!res || !res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  },

  async download(src, externalId) {
    const res = await fetch(`${DRIVE}/files/${encodeURIComponent(externalId)}?alt=media`, { cache: "no-store", headers: { authorization: `Bearer ${src.token}` } });
    if (!res.ok) throw new FileProviderError(`Google Drive download: ${res.status}`, { status: res.status, auth: res.status === 401 });
    return { body: Buffer.from(await res.arrayBuffer()), mime: res.headers.get("content-type") };
  },
};
