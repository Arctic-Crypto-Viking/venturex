import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAccount, getCurrentUser } from "@core/lib/auth";
import { createClient } from "@core/lib/supabase/server";
import { publicEnv } from "@core/lib/env";
import { safeNext } from "@core/lib/safe-next";
import { featureValue, getEntitlements, UNLIMITED } from "@core/lib/entitlements";
import { FILE_PROVIDER_KEYS, getFileProvider } from "@core/lib/files/providers";
import { encodeFilesState } from "@core/lib/files/state";
import type { ConnectedProviderKey } from "@core/lib/files/types";
import { product } from "@product";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BACK = "/app/files";

/**
 * Connect Dropbox or Google Drive, step 1: a signed-in member asks for the
 * consent dialog. The plan's files.sources_max is checked here for a clean
 * message (files_connect() re-checks it in SQL); the state carries user,
 * account, actor, provider and the return path, signed.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: key } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${BACK}`, publicEnv.siteUrl));
  const account = await getCurrentAccount();
  if (!account) return NextResponse.redirect(new URL(product.homePath, publicEnv.siteUrl));
  const next = safeNext(request.nextUrl.searchParams.get("next"), BACK);
  const fail = (code: string) => NextResponse.redirect(new URL(`${next}${next.includes("?") ? "&" : "?"}error=${code}`, publicEnv.siteUrl));
  if (!FILE_PROVIDER_KEYS.includes(key as ConnectedProviderKey)) return fail("provider");

  const supabase = await createClient();
  const actorParam = request.nextUrl.searchParams.get("actor");
  const actor = actorParam && UUID.test(actorParam) ? actorParam : null;
  if (actor && product.social) {
    const actors = await product.social.actors(supabase, account.id);
    if (!actors.some((a) => a.id === actor)) return fail("actor");
  }

  const ent = await getEntitlements(supabase, account.id);
  const max = featureValue(ent, "files.sources_max");
  const { count } = await supabase.from("file_connections").select("id", { count: "exact", head: true }).eq("account_id", account.id).neq("provider", "upload").is("disconnected_at", null);
  if (max !== UNLIMITED && (count ?? 0) >= max) return fail("limit");

  let url: string;
  try {
    const state = encodeFilesState({ u: user.id, a: account.id, r: actor, p: key, n: next });
    url = getFileProvider(key).authUrl(state, `${publicEnv.siteUrl}/api/files/oauth/${key}/callback`);
  } catch (e) {
    console.error("files: start", e);
    return fail("config");
  }
  return NextResponse.redirect(url);
}
