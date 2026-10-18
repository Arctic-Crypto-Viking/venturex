import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@core/lib/supabase/server";
import { safeNext } from "@core/lib/safe-next";

/**
 * Token-hash sign-in (the Supabase server-side pattern). Works from ANY browser
 * or device — unlike /auth/callback (PKCE), which only works in the browser that
 * requested the link. Used by:
 *   - the "Confirm sign up" and "Magic link" e-mail templates (a first-time
 *     address gets the former), both with type=email, which accepts either token:
 *       {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/app
 *   - scripts/dev-login-link.mjs (sign-in link without e-mail)
 *
 * Two steps, on purpose. The token works once, and a link is opened by more
 * than the person it was sent to: a chat app fetches it to build a preview, a
 * mail scanner fetches it to check it. So GET signs nobody in — it forwards to
 * /auth/continue, a page with one button — and only the POST from that button
 * spends the token.
 */
const TYPES: readonly string[] = ["email", "magiclink", "signup", "recovery", "invite", "email_change"];

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "");
  const nextPath = safeNext(String(form.get("next") ?? ""));

  if (tokenHash && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
    if (!error) return NextResponse.redirect(new URL(nextPath, request.url), 303);
  }
  return NextResponse.redirect(new URL("/login?error=link", request.url), 303);
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const nextPath = safeNext(request.nextUrl.searchParams.get("next"));

  if (tokenHash && type && TYPES.includes(type)) {
    const url = new URL("/auth/continue", request.url);
    url.search = new URLSearchParams({ token_hash: tokenHash, type, next: nextPath }).toString();
    return NextResponse.redirect(url);
  }
  return NextResponse.redirect(new URL("/login?error=link", request.url));
}
