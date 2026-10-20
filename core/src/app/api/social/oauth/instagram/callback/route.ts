import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@core/lib/auth";
import { createAdminClient } from "@core/lib/supabase/admin";
import { publicEnv } from "@core/lib/env";
import { safeNext } from "@core/lib/safe-next";
import { getProvider } from "@core/lib/social/providers";
import { decodeState } from "@core/lib/social/state";
import { ProviderError } from "@core/lib/social/types";

const BACK = "/app/social/accounts";

/**
 * Connect Instagram, step 2: Instagram sends the person back with ?code and our
 * ?state. The state must verify and belong to the signed-in person; then the
 * code becomes a long-lived token (never seen by the browser), the profile is
 * read, and social_connect() (service role, SQL) stores the token in Vault and
 * the profile on social_accounts. Every outcome returns to the Social accounts
 * page with one word in ?connected / ?error, which the page turns into a sentence.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const state = decodeState(sp.get("state"));
  const next = safeNext(state?.n, BACK);
  const back = (q: Record<string, string>) => {
    const u = new URL(next, publicEnv.siteUrl);
    for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
    return NextResponse.redirect(u);
  };
  if (!state) return back({ error: "state" });
  // The person who started the flow is in the signed state. On a phone the consent
  // sheet often opens in another browser context (the Instagram app's in-app
  // browser), which has no Mainfloor cookie: the state, signed by the server ten
  // minutes ago at most and bound to that person and account, is then the only
  // proof there is, and social_connect() re-checks the membership in SQL. When a
  // cookie IS present it must belong to the same person.
  const user = await getCurrentUser();
  if (user && user.id !== state.u) return back({ error: "state" });
  const userId = state.u;
  // without a cookie the page we return to asks for sign-in first, and keeps ?connected
  const signedOut = !user;
  const done = (q: Record<string, string>) => {
    if (!signedOut) return back(q);
    const target = new URL(next, publicEnv.siteUrl);
    for (const [k, v] of Object.entries(q)) target.searchParams.set(k, v);
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(target.pathname + target.search)}`, publicEnv.siteUrl));
  };

  if (sp.get("error")) {
    // access_denied: the person pressed Cancel on Instagram's sheet
    return done({ error: sp.get("error_reason") === "user_denied" || sp.get("error") === "access_denied" ? "denied" : "instagram", detail: (sp.get("error_description") ?? "").slice(0, 200) });
  }
  const code = sp.get("code");
  if (!code) return done({ error: "state" });

  const provider = getProvider("instagram");
  let token: string, expiresAt: Date, profile;
  try {
    ({ token, expiresAt, profile } = await provider.exchangeCode(code, `${publicEnv.siteUrl}/api/social/oauth/instagram/callback`));
  } catch (e) {
    console.error("social: code exchange", e instanceof ProviderError ? { message: e.message, code: e.code, status: e.status } : e);
    return done({ error: "exchange", detail: (e instanceof Error ? e.message : "").slice(0, 200) });
  }
  if (profile.accountType && !["business", "creator"].includes(profile.accountType)) {
    return done({ error: "personal", handle: profile.handle ?? "" });
  }

  const admin = createAdminClient();
  const { data: id, error } = await admin.rpc("social_connect", {
    p_account: state.a, p_actor: state.r, p_user: userId, p_provider: "instagram", p_external_id: profile.externalId,
    p_handle: profile.handle, p_display_name: profile.displayName, p_avatar_url: profile.avatarUrl, p_account_type: profile.accountType,
    p_scopes: profile.scopes, p_token: token, p_expires_at: expiresAt.toISOString(),
  });
  if (error) {
    const m = error.message;
    const codeWord = m.includes("already connected elsewhere") ? "elsewhere" : m.includes("Your plan allows") ? "limit" : m.includes("not a member") ? "member" : "save";
    return done({ error: codeWord, detail: m.slice(0, 200) });
  }
  await admin.from("social_publish_log").insert({
    account_id: state.a, social_account_id: id, step: "connect", ok: true,
    request: { provider: "instagram", actor: state.r }, response: { handle: profile.handle, account_type: profile.accountType, scopes: profile.scopes },
  });
  return done({ connected: String(id) });
}
