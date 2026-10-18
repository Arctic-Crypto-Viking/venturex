import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@core/lib/supabase/server";
import { safeNext } from "@core/lib/safe-next";

/** Exchanges the magic-link code for a session cookie, then forwards to `next`. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = safeNext(request.nextUrl.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(nextPath, request.url));
  }
  return NextResponse.redirect(new URL("/login?error=link", request.url));
}
