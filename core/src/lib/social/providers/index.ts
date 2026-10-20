import "server-only";

import type { ProviderKey, SocialProvider } from "../types";
import { instagram } from "./instagram";

/** The adapters a product can connect to. Instagram first (S10); Threads and Facebook arrive behind the same interface. */
const PROVIDERS: Partial<Record<ProviderKey, SocialProvider>> = { instagram };

export function getProvider(key: string): SocialProvider {
  const p = PROVIDERS[key as ProviderKey];
  if (!p) throw new Error(`No social provider "${key}".`);
  return p;
}

export const PROVIDER_KEYS = Object.keys(PROVIDERS) as ProviderKey[];
