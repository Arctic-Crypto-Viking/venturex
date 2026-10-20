/**
 * The browser's own User-Agent and IP address, for the Auth calls the server
 * makes on its behalf (link sign-in in /auth/confirm, the proxy's refresh).
 * Supabase Auth records both on the session (auth.sessions), and Signed-in
 * devices shows them: without this every such session reads as the server.
 *
 * The IP comes from the host's own headers (Vercel sets x-real-ip and
 * x-forwarded-for itself and drops a visitor's copies), never from anything
 * else the browser sent. Sent as x-forwarded-for and as sb-forwarded-for,
 * which newer Supabase Auth reads first when the project enables it.
 */
export function clientHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  const ua = h.get("user-agent");
  if (ua) out["user-agent"] = ua.slice(0, 512);
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) {
    out["x-forwarded-for"] = ip;
    out["sb-forwarded-for"] = ip;
  }
  return out;
}
