/**
 * Environment access in one place. Public values are safe in the browser;
 * everything else is server-only and must never reach a client bundle.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  // Supabase now issues "publishable" keys; the legacy "anon" key still works.
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "",
  // The address this deployment runs on (sign-in redirects, feed links). The
  // product's name and canonical addresses are `product.brand`, not env.
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

export function requirePublicEnv() {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or _ANON_KEY). Copy .env.example to .env.local.",
    );
  }
  return publicEnv;
}
