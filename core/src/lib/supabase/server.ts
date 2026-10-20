import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { requirePublicEnv } from "@core/lib/env";
import { clientHeaders } from "@core/lib/supabase/client-headers";

/**
 * Server client for Server Components, Server Functions and Route Handlers.
 * Runs as the signed-in user (RLS applies). Cookies are read from the request;
 * writes only succeed in Server Functions / Route Handlers, which is why the
 * catch below is silent in Server Components.
 */
export async function createClient() {
  const cookieStore = await cookies(); // request-time API: marks the route dynamic
  const requestHeaders = await headers();
  const { supabaseUrl, supabaseAnonKey } = requirePublicEnv();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    // the browser's device and IP on the sessions Auth creates or refreshes here
    global: { headers: clientHeaders(requestHeaders) },
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
