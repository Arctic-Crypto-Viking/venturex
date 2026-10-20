import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@core/lib/auth";
import { createAdminClient } from "@core/lib/supabase/admin";
import { publicEnv } from "@core/lib/env";
import { safeNext } from "@core/lib/safe-next";
import { getFileProvider } from "@core/lib/files/providers";
import { decodeFilesState } from "@core/lib/files/state";

const BACK = "/app/files";

/**
 * Connect a cloud, step 2: the provider sends the person back with ?code and our
 * ?state. The state must verify, name this provider and belong to the signed-in
 * person; then the code becomes tokens (never seen by the browser), the profile
 * is read, and files_connect() (service role, SQL) stores the tokens in Vault
 * and the source row. Every outcome returns to the Library with one word in
 * ?connected / ?error, which the page turns into a sentence.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: key } = await params;
  const sp = request.nextUrl.searchParams;
  const state = decodeFilesState(sp.get("state"));
  const next = safeNext(state?.n, BACK);
  const back = (q: Record<string, string>) => {
    const u = new URL(next, publicEnv.siteUrl);
    for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
    return NextResponse.redirect(u);
  };
  if (!state || state.p !== key) return back({ error: "state" });
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, publicEnv.siteUrl));
  if (user.id !== state.u) return back({ error: "state" });
  if (sp.get("error")) return back({ error: sp.get("error") === "access_denied" ? "denied" : "provider", detail: (sp.get("error_description") ?? "").slice(0, 200) });
  const code = sp.get("code");
  if (!code) return back({ error: "state" });

  let provider;
  try { provider = getFileProvider(key); } catch { return back({ error: "provider" }); }
  let tokens: Awaited<ReturnType<typeof provider.exchangeCode>>;
  try {
    tokens = await provider.exchangeCode(code, `${publicEnv.siteUrl}/api/files/oauth/${key}/callback`);
  } catch (e) {
    console.error("files: code exchange", e);
    return back({ error: "exchange", detail: (e instanceof Error ? e.message : "").slice(0, 200) });
  }

  const admin = createAdminClient();
  const { data: id, error } = await admin.rpc("files_connect", {
    p_account: state.a, p_actor: state.r, p_user: user.id, p_provider: key, p_external_id: tokens.profile.externalId,
    p_label: tokens.profile.label, p_scopes: tokens.profile.scopes, p_token: tokens.token, p_refresh: tokens.refresh,
    p_expires_at: tokens.expiresAt?.toISOString() ?? null,
  });
  if (error) {
    const m = error.message;
    const word = m.includes("Your plan allows") ? "limit" : m.includes("not a member") ? "member" : "save";
    return back({ error: word, detail: m.slice(0, 200) });
  }
  return back({ connected: String(id) });
}
