/**
 * Library (core): the shapes shared by the provider adapters, the sync worker
 * and the screens. docs/FILES.md §4 is the contract; nothing above the adapter
 * knows which cloud a file lives in.
 */
export type FileProviderKey = "upload" | "dropbox" | "google_drive";
export type ConnectedProviderKey = Exclude<FileProviderKey, "upload">;
export type FileKind = "image" | "video" | "other";
export type SourceHealth = "ok" | "expiring" | "reconnect" | "disconnected";

/** A folder as the provider describes it. */
export type RemoteFolder = { externalId: string; name: string; path: string; parentExternalId: string | null };

/** A file as the provider describes it. Dimensions and duration only when the provider says them. */
export type RemoteFile = {
  externalId: string;
  name: string;
  /** Provider path, lower-cased where the provider compares that way (Dropbox); null where there is none (Drive). */
  path: string | null;
  parentExternalId: string | null;
  mime: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  durationS: number | null;
  takenAt: string | null;
  modifiedAt: string | null;
  rev: string | null;
  /** Gone at the provider (trashed, deleted, access lost). */
  removed?: boolean;
};

/** One page of changes since a cursor. `cursor` is opaque to everything but the adapter. */
export type ChangeSet = { files: RemoteFile[]; folders: RemoteFolder[]; removedPaths: string[]; cursor: string; more: boolean };

/** A connected source as the worker sees it: the row id plus the access token read from Vault. */
export type ConnectedSource = { id: string; token: string };

export type SourceProfile = { externalId: string; label: string; scopes: string[] };

/** Thrown by an adapter when the provider said no. `transient` = worth one more try; `auth` = the token is dead. */
export class FileProviderError extends Error {
  readonly status: number;
  readonly transient: boolean;
  readonly auth: boolean;
  readonly body: unknown;
  constructor(message: string, opts: { status?: number; transient?: boolean; auth?: boolean; body?: unknown } = {}) {
    super(message);
    this.name = "FileProviderError";
    this.status = opts.status ?? 0;
    this.transient = opts.transient ?? false;
    this.auth = opts.auth ?? false;
    this.body = opts.body;
  }
}

export interface FileProvider {
  key: ConnectedProviderKey;
  /** The provider's consent dialog; `state` is our signed state (core/src/lib/files/state.ts). */
  authUrl(state: string, redirectUri: string): string;
  /** Code → access token (+ refresh token where the provider issues one) and who the person is there. */
  exchangeCode(code: string, redirectUri: string): Promise<{ token: string; refresh: string | null; expiresAt: Date | null; profile: SourceProfile }>;
  refresh(refreshToken: string): Promise<{ token: string; expiresAt: Date | null }>;
  /** How the person chooses what to index: whole folders (the adapter lists them) or files picked in the provider's own picker. */
  selection: "folders" | "picker";
  /** Folders under a parent (null = the root), for the folder choice. Only for `selection: "folders"`. */
  listFolders(src: ConnectedSource, parentExternalId: string | null): Promise<RemoteFolder[]>;
  /** Everything new, changed or gone since `cursor` under the chosen roots (null cursor = from the start). */
  changes(src: ConnectedSource, cursor: string | null, roots: string[]): Promise<ChangeSet>;
  /** The files behind ids the person picked (Google's Picker). Only for `selection: "picker"`. */
  describe(src: ConnectedSource, externalIds: string[]): Promise<RemoteFile[]>;
  /** A JPEG thumbnail, or null when the provider has none for that file. */
  thumbnail(src: ConnectedSource, file: Pick<RemoteFile, "externalId" | "mime" | "name">): Promise<Buffer | null>;
  /** The original bytes. */
  download(src: ConnectedSource, externalId: string): Promise<{ body: Buffer; mime: string | null }>;
}

export const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif", "image/tiff"]);
export const VIDEO_MIME = new Set(["video/mp4", "video/quicktime", "video/x-m4v", "video/webm"]);
/** Only what Instagram takes goes out as a video; anything else is shown but never staged (docs/FILES.md F6). */
export const POSTABLE_VIDEO_MIME = new Set(["video/mp4", "video/quicktime"]);

export function kindOf(mime: string | null, name: string): FileKind {
  const m = (mime ?? "").toLowerCase();
  if (IMAGE_MIME.has(m)) return "image";
  if (VIDEO_MIME.has(m)) return "video";
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "tif", "tiff"].includes(ext)) return "image";
  if (["mp4", "mov", "m4v", "webm"].includes(ext)) return "video";
  return "other";
}

export function mimeFromName(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", gif: "image/gif", tif: "image/tiff", tiff: "image/tiff",
    mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm",
  };
  return map[ext] ?? null;
}
