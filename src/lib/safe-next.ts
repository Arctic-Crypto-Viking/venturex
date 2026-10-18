/**
 * Where to send someone after sign-in: a path on THIS site, or the fallback.
 *
 * `next` arrives in the URL, so anyone can write it into a link. Accepting
 * "/…" is not enough: "/\evil.com" is read by browsers as "//evil.com" (another
 * site), and "javascript:…" in window.location.assign() runs script in our
 * origin. So the value is resolved against a dummy origin and kept only if it
 * stays there — and so does the normalised path + query + hash it returns.
 */
export function safeNext(value: string | null | undefined, fallback = "/app"): string {
  if (!value || !value.startsWith("/")) return fallback;
  try {
    const base = "https://same-site.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    const out = `${url.pathname}${url.search}${url.hash}`;
    // dot segments can normalise into "//host" ("/.//evil", "/a/..//evil"): the result must
    // itself be a same-site path, or the browser reads it as another site
    if (out.startsWith("//") || out.startsWith("/\\") || new URL(out, base).origin !== base) return fallback;
    return out;
  } catch {
    return fallback;
  }
}
