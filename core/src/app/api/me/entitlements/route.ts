import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@core/lib/supabase/server";
import { getCurrentAccount, getCurrentUser } from "@core/lib/auth";
import { getEntitlements } from "@core/lib/entitlements";

/**
 * GET /api/me/entitlements?account=<id>
 * The resolved feature payload for one of the caller's accounts. The client
 * uses it to show or hide UI only; gated actions are re-checked server-side.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const account = await getCurrentAccount(request.nextUrl.searchParams.get("account"));
  if (!account) return NextResponse.json({ error: "no account" }, { status: 404 });

  const supabase = await createClient();
  const [entitlements, entitledRes] = await Promise.all([
    getEntitlements(supabase, account.id),
    supabase.rpc("is_entitled", { p_account: account.id }),
  ]);

  return NextResponse.json(
    {
      account: { id: account.id, slug: account.slug, access_status: account.accessStatus },
      entitled: Boolean(entitledRes.data),
      entitlements,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
