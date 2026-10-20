import "server-only";

import type { ConnectedProviderKey, FileProvider } from "../types";
import { dropbox } from "./dropbox";
import { googleDrive } from "./google-drive";

/** The clouds a Library can connect to. OneDrive, iCloud shared albums … arrive behind the same interface. */
const PROVIDERS: Record<ConnectedProviderKey, FileProvider> = { dropbox, google_drive: googleDrive };

export function getFileProvider(key: string): FileProvider {
  const p = PROVIDERS[key as ConnectedProviderKey];
  if (!p) throw new Error(`No file provider "${key}".`);
  return p;
}

export const FILE_PROVIDER_KEYS = Object.keys(PROVIDERS) as ConnectedProviderKey[];

/** Whether the server has the credentials for a provider (the connect button is shown only then). */
export function fileProviderConfigured(key: ConnectedProviderKey): boolean {
  return key === "dropbox"
    ? Boolean(process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET)
    : Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.NEXT_PUBLIC_GOOGLE_API_KEY && process.env.NEXT_PUBLIC_GOOGLE_APP_ID);
}
