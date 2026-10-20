import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta's `signed_request` (deauthorize and data-deletion callbacks):
 * "<base64url signature>.<base64url payload>", HMAC-SHA256 of the payload with
 * the app secret. Returns the payload or null when it does not verify.
 */
export function parseSignedRequest(value: string | null | undefined, secret: string | undefined): { user_id?: string; algorithm?: string; issued_at?: number } | null {
  if (!value || !secret) return null;
  const [sig, payload] = value.split(".", 2);
  if (!sig || !payload) return null;
  const want = createHmac("sha256", secret).update(payload).digest();
  let got: Buffer;
  try { got = Buffer.from(sig, "base64url"); } catch { return null; }
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { user_id?: string | number; algorithm?: string; issued_at?: number };
    if (data.algorithm && data.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
    return { ...data, user_id: data.user_id === undefined ? undefined : String(data.user_id) };
  } catch {
    return null;
  }
}
