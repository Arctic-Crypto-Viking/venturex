import { createProxy } from "@core/proxy";
import { product } from "@product";

// The gate itself is platform core (core/src/proxy.ts): session refresh, sign-in
// redirect for the private prefixes, 404 for /admin to everyone but the superadmin.
export const proxy = createProxy(product.privatePrefixes);

export const config = {
  matcher: [
    // everything except static assets and images. A literal: Next reads it statically.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
