import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The OAuth `state`: who started the connect flow, for which account and actor,
 * and where to return — signed with CRON_SECRET (the same server secret that
 * signs the digest's unsubscribe links), so the callback trusts nothing from the
 * browser it did not sign itself. Ten minutes, single purpose.
 */
export type ConnectState = { v: 1; u: string; a: string; r: string | null; n: string; t: number };

const TTL_MS = 10 * 60_000;

function secret(): string {
  const s = process.env.CRON_SECRET;
  if (!s) throw new Error("CRON_SECRET is not set (server only); it signs the connect flow.");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(`social-state:${payload}`).digest("base64url");

export function encodeState(s: Omit<ConnectState, "v" | "t">): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, t: Date.now(), ...s } satisfies ConnectState)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeState(value: string | null | undefined, now = Date.now()): ConnectState | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ConnectState;
    if (s.v !== 1 || typeof s.u !== "string" || typeof s.a !== "string" || typeof s.n !== "string" || typeof s.t !== "number") return null;
    if (now - s.t > TTL_MS || s.t > now + 60_000) return null;
    return s;
  } catch {
    return null;
  }
}
