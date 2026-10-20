import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@core/lib/env";
import { clientHeaders } from "@core/lib/supabase/client-headers";

/**
 * The request gate every product uses. Its `src/proxy.ts` is two lines:
 *
 *   export const proxy = createProxy(product.privatePrefixes);
 *   export const config = { matcher: [ …literal… ] }; // Next reads the matcher statically
 *
 * Runs before every matched request:
 *  1. refreshes the Supabase session cookie (so Server Components see a valid JWT);
 *  2. sends signed-out visitors of private routes to /login;
 *  3. shows a plain 404 for /admin to anyone signed out — the admin layout then
 *     re-checks users.is_superadmin from the DATABASE, not the token (spec §1).
 * Proxy is an optimistic gate only; every server action re-checks authorization.
 */
export function createProxy(privatePrefixes: string[]) {
  const prefixes = [...new Set([...privatePrefixes, "/admin"])];

  return async function proxy(request: NextRequest) {
    let response = NextResponse.next({ request });

    if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
      return response; // env not configured yet; pages will explain
    }

    const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
      // a refresh records the browser's device and IP on the session, not the server's
      global: { headers: clientHeaders(request.headers) },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    // Verifies the JWT (locally with asymmetric keys, otherwise via the Auth server)
    // and refreshes it when it is about to expire.
    const { data } = await supabase.auth.getClaims();
    const signedIn = Boolean(data?.claims?.sub);

    const { pathname } = request.nextUrl;
    const isPrivate = prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));

    if (!signedIn && isPrivate) {
      if (pathname.startsWith("/admin")) {
        // 404, not 403: the admin area does not exist for outsiders
        return NextResponse.rewrite(new URL("/404", request.url), { status: 404 });
      }
      const url = new URL("/login", request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    return response;
  };
}
