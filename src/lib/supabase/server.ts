import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requirePublicEnv } from "@core/lib/env";

/**
 * Server client for Server Components, Server Functions and Route Handlers.
 * Runs as the signed-in user (RLS applies). Cookies are read from the request;
 * writes only succeed in Server Functions / Route Handlers, which is why the
 * catch below is silent in Server Components.
 */
export async function createClient() {
  const cookieStore = await cookies(); // request-time API: marks the route dynamic
  const { supabaseUrl, supabaseAnonKey } = requirePublicEnv();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component: the proxy refreshes sessions instead.
        }
      },
    },
  });
}
