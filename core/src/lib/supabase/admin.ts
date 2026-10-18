import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@core/lib/env";

/**
 * Service-role client. Bypasses RLS — use it ONLY inside server code that has
 * already verified the caller (superadmin routes, webhooks, workers), never
 * pass its results to the client unfiltered, and never import it from a
 * client component (the `server-only` import makes that a build error).
 */
export function createAdminClient() {
  // Modern "secret" key (sb_secret_…) or the legacy service_role JWT — both bypass RLS.
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!publicEnv.supabaseUrl || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (server only).");
  }
  return createSupabaseClient(publicEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
