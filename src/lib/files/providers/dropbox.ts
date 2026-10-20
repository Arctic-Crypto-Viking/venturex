import "server-only";

import { FileProviderError, kindOf, mimeFromName, type ConnectedSource, type FileProvider, type RemoteFile, type RemoteFolder } from "../types";

/**
 * Dropbox (docs/FILES.md F3): a "Full Dropbox" app, scopes account_info.read,
 * files.metadata.read, files.content.read; the person chooses folders in our
 * own screen and the sync follows each folder with the provider's cursor
 * (list_folder → list_folder/continue). Short-lived access tokens (4 h) with a
 * refresh token that does not expire (token_access_type=offline). Credentials:
 * server-only env DROPBOX_APP_KEY / DROPBOX_APP_SECRET. Development apps link
 * up to 50 users before production approval is needed (free, a form).
 *
 * Dimensions: Dropbox no longer returns media_info on listings, so an item's
 * width and height come from the cached thumbnail (the sync stores the thumb's
 * size); that is enough to choose a portrait or square post format.
 */
const AUTHORIZE = "https://www.dropbox.com/oauth2/authorize";
const TOKEN = "https://api.dropboxapi.com/oauth2/token";
const API = "https://api.dropboxapi.com/2";
const CONTENT = "https://content.dropboxapi.com/2";
export const DROPBOX_SCOPES = ["account_info.read", "files.metadata.read", "files.content.read"] as const;

function creds() {
  const key = process.env.DROPBOX_APP_KEY;
  const secret = process.env.DROPBOX_APP_SECRET;
  if (!key || !secret) throw new Error("DROPBOX_APP_KEY / DROPBOX_APP_SECRET are not set (server only).");
  return { key, secret };
}

type DbxError = { error_summary?: string; error?: unknown };

async function rpc<T>(src: ConnectedSource, path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}/${path}`, {
      method: "POST", cache: "no-store",
      headers: { authorization: `Bearer ${src.token}`, "content-type": "application/json" },
      body: body === null ? "null" : JSON.stringify(body),
    });
  } catch (e) {
    throw new FileProviderError(e instanceof Error ? e.message : "network error", { transient: true });
  }
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    const summary = (json as DbxError | null)?.error_summary ?? text.slice(0, 200);
    throw new FileProviderError(`Dropbox ${path}: ${summary}`, { status: res.status, auth: res.status === 401, transient: res.status === 429 || res.status >= 500, body: json });
  }
  return json as T;
}

async function content(src: ConnectedSource, path: string, arg: unknown): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${CONTENT}/${path}`, {
      method: "POST", cache: "no-store",
      headers: { authorization: `Bearer ${src.token}`, "Dropbox-API-Arg": JSON.stringify(arg) },
    });
  } catch (e) {
    throw new FileProviderError(e instanceof Error ? e.message : "network error", { transient: true });
  }
  if (!res.ok) {
    const text = await res.text();
    throw new FileProviderError(`Dropbox ${path}: ${text.slice(0, 200)}`, { status: res.status, auth: res.status === 401, transient: res.status === 429 || res.status >= 500 });
  }
  return res;
}

type Entry = {
  ".tag": "file" | "folder" | "deleted";
  id?: string; name: string; path_lower?: string; path_display?: string;
  size?: number; rev?: string; client_modified?: string; server_modified?: string;
};
type ListResult = { entries: Entry[]; cursor: string; has_more: boolean };

function fileOf(e: Entry): RemoteFile {
  const mime = mimeFromName(e.name);
  const pathLower = e.path_lower ?? null;
  const parent = pathLower ? parentOf(pathLower) : null;
  return {
    externalId: e.id!, name: e.name, path: pathLower, parentExternalId: parent,
    mime, bytes: e.size ?? null, width: null, height: null, durationS: null, takenAt: null,
    modifiedAt: e.client_modified ?? e.server_modified ?? null, rev: e.rev ?? null,
  };
}
const parentOf = (p: string) => { const i = p.lastIndexOf("/"); return i <= 0 ? "" : p.slice(0, i); };

/** Several roots → one cursor per root, kept as JSON in file_sources.cursor. */
type Cursors = Record<string, string>;

export const dropbox: FileProvider = {
  key: "dropbox",
  selection: "folders",

  authUrl(state, redirectUri) {
    const { key } = creds();
    const u = new URL(AUTHORIZE);
    u.searchParams.set("client_id", key);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("state", state);
    u.searchParams.set("token_access_type", "offline");
    u.searchParams.set("scope", DROPBOX_SCOPES.join(" "));
    return u.toString();
  },

  async exchangeCode(code, redirectUri) {
    const { key, secret } = creds();
    const res = await fetch(TOKEN, {
      method: "POST", cache: "no-store", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, grant_type: "authorization_code", client_id: key, client_secret: secret, redirect_uri: redirectUri }),
    });
    const j = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number; account_id?: string; scope?: string; error_description?: string } | null;
    if (!res.ok || !j?.access_token) throw new FileProviderError(`Dropbox token: ${j?.error_description ?? res.status}`, { status: res.status });
    const src = { id: "", token: j.access_token };
    const me = await rpc<{ account_id: string; email?: string; name?: { display_name?: string } }>(src, "users/get_current_account", null);
    return {
      token: j.access_token, refresh: j.refresh_token ?? null,
      expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null,
      profile: { externalId: j.account_id ?? me.account_id, label: me.email ?? me.name?.display_name ?? "Dropbox", scopes: (j.scope ?? "").split(" ").filter(Boolean) },
    };
  },

  async refresh(refreshToken) {
    const { key, secret } = creds();
    const res = await fetch(TOKEN, {
      method: "POST", cache: "no-store", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: key, client_secret: secret }),
    });
    const j = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error_description?: string } | null;
    if (!res.ok || !j?.access_token) throw new FileProviderError(`Dropbox refresh: ${j?.error_description ?? res.status}`, { status: res.status, auth: res.status === 400 || res.status === 401 });
    return { token: j.access_token, expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null };
  },

  async listFolders(src, parent) {
    const out: RemoteFolder[] = [];
    let r = await rpc<ListResult>(src, "files/list_folder", { path: parent ?? "", recursive: false, limit: 2000, include_deleted: false, include_non_downloadable_files: false });
    for (;;) {
      for (const e of r.entries) if (e[".tag"] === "folder" && e.path_lower) out.push({ externalId: e.path_lower, name: e.name, path: e.path_display ?? e.name, parentExternalId: parent });
      if (!r.has_more) break;
      r = await rpc<ListResult>(src, "files/list_folder/continue", { cursor: r.cursor });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },

  /** A root is a folder's path_lower; its cursor follows it. At most 10 pages per root per run. */
  async changes(src, cursor, roots) {
    const cursors: Cursors = cursor ? (JSON.parse(cursor) as Cursors) : {};
    const files: RemoteFile[] = [];
    const folders: RemoteFolder[] = [];
    const removedPaths: string[] = [];
    let more = false;
    for (const root of roots) {
      let r: ListResult = cursors[root]
        ? await rpc<ListResult>(src, "files/list_folder/continue", { cursor: cursors[root] })
        : await rpc<ListResult>(src, "files/list_folder", { path: root, recursive: true, limit: 2000, include_deleted: true, include_non_downloadable_files: false });
      for (let page = 0; ; page++) {
        for (const e of r.entries) {
          if (e[".tag"] === "folder" && e.path_lower && e.path_lower !== root) folders.push({ externalId: e.path_lower, name: e.name, path: (e.path_display ?? e.name).replace(/^\//, ""), parentExternalId: parentOf(e.path_lower) });
          else if (e[".tag"] === "file" && e.id && kindOf(mimeFromName(e.name), e.name) !== "other") files.push(fileOf(e));
          else if (e[".tag"] === "deleted" && e.path_lower) removedPaths.push(e.path_lower);
        }
        cursors[root] = r.cursor;
        if (!r.has_more) break;
        if (page >= 9) { more = true; break; }
        r = await rpc<ListResult>(src, "files/list_folder/continue", { cursor: r.cursor });
      }
    }
    for (const k of Object.keys(cursors)) if (!roots.includes(k)) delete cursors[k];
    return { files, folders, removedPaths, cursor: JSON.stringify(cursors), more };
  },

  async describe() {
    return [];
  },

  /** JPEG, longest side 640. Dropbox makes thumbnails for photos (and recent videos); anything it refuses → null. */
  async thumbnail(src, file) {
    try {
      const res = await content(src, "files/get_thumbnail_v2", {
        resource: { ".tag": "path", path: file.externalId }, format: { ".tag": "jpeg" }, size: { ".tag": "w640h480" }, mode: { ".tag": "bestfit" },
      });
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (e instanceof FileProviderError && (e.status === 409 || e.status === 400)) return null;
      throw e;
    }
  },

  async download(src, externalId) {
    const res = await content(src, "files/download", { path: externalId });
    return { body: Buffer.from(await res.arrayBuffer()), mime: res.headers.get("content-type") };
  },
};
