import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The OAuth `state` of a Library connect flow: who started it, for which account
 * and actor, which provider, and where to return — signed with CRON_SECRET (the
 * same server secret that signs the Social connect flow and the digest's
 * unsubscribe links), so the callback trusts nothing from the browser it did not
 * sign itself. Ten minutes, single purpose, its own prefix so a Social state can
 * never be replayed here.
 */
export type FilesState = { v: 1; u: string; a: string; r: string | null; p: string; n: string; t: number };

const TTL_MS = 10 * 60_000;

function secret(): string {
  const s = process.env.CRON_SECRET;
  if (!s) throw new Error("CRON_SECRET is not set (server only); it signs the connect flow.");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(`files-state:${payload}`).digest("base64url");

export function encodeFilesState(s: Omit<FilesState, "v" | "t">): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, t: Date.now(), ...s } satisfies FilesState)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeFilesState(value: string | null | undefined, now = Date.now()): FilesState | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as FilesState;
    if (s.v !== 1 || typeof s.u !== "string" || typeof s.a !== "string" || typeof s.p !== "string" || typeof s.n !== "string" || typeof s.t !== "number") return null;
    if (now - s.t > TTL_MS || s.t > now + 60_000) return null;
    return s;
  } catch {
    return null;
  }
}
