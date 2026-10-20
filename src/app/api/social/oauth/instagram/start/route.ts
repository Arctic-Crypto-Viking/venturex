import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAccount, getCurrentUser } from "@core/lib/auth";
import { createClient } from "@core/lib/supabase/server";
import { publicEnv } from "@core/lib/env";
import { safeNext } from "@core/lib/safe-next";
import { featureValue, getEntitlements, UNLIMITED } from "@core/lib/entitlements";
import { getProvider } from "@core/lib/social/providers";
import { encodeState } from "@core/lib/social/state";
import { product } from "@product";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BACK = "/app/social/accounts";

/**
 * Connect Instagram, step 1: a signed-in member asks for the consent dialog. The
 * actor must be one of the account's (product.social.actors), the plan's
 * social.accounts_max is checked here for a clean message (social_connect()
 * re-checks it in SQL), and the state carries user, account, actor and the
 * return path, signed, so the callback trusts only what it signed.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${BACK}`, publicEnv.siteUrl));
  const account = await getCurrentAccount();
  if (!account || !product.social) return NextResponse.redirect(new URL(product.homePath, publicEnv.siteUrl));
  const next = safeNext(request.nextUrl.searchParams.get("next"), BACK);
  const fail = (code: string) => NextResponse.redirect(new URL(`${next}${next.includes("?") ? "&" : "?"}error=${code}`, publicEnv.siteUrl));

  const actorParam = request.nextUrl.searchParams.get("actor");
  const supabase = await createClient();
  const actors = await product.social.actors(supabase, account.id);
  const actor = actorParam && UUID.test(actorParam) ? actors.find((a) => a.id === actorParam) : null;
  if (actorParam && !actor) return fail("actor");

  const ent = await getEntitlements(supabase, account.id);
  const max = featureValue(ent, "social.accounts_max");
  const { count } = await supabase.from("social_connections").select("id", { count: "exact", head: true }).eq("account_id", account.id).is("disconnected_at", null);
  if (max !== UNLIMITED && (count ?? 0) >= max) return fail("limit");

  let url: string;
  try {
    const state = encodeState({ u: user.id, a: account.id, r: actor?.id ?? null, n: next });
    url = getProvider("instagram").authUrl(state, `${publicEnv.siteUrl}/api/social/oauth/instagram/callback`);
  } catch (e) {
    console.error("social: start", e);
    return fail("config");
  }
  return NextResponse.redirect(url);
}
