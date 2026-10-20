import type { NextRequest } from "next/server";
import { createAdminClient } from "@core/lib/supabase/admin";
import { parseSignedRequest } from "@core/lib/social/meta-signed-request";

/**
 * Meta's Deauthorize callback (Business login settings, SOCIAL-MANAGER §9 step 9):
 * the person removed the app in Instagram. The matching connection is
 * disconnected (social_disconnect: token out of Vault, waiting posts held).
 * Verified with the app secret; anything else is answered 400.
 */
export async function POST(request: NextRequest) {
  const fd = await request.formData().catch(() => null);
  const data = parseSignedRequest(fd?.get("signed_request")?.toString(), process.env.INSTAGRAM_APP_SECRET);
  if (!data?.user_id) return new Response("Bad signed_request", { status: 400 });
  const admin = createAdminClient();
  const { data: rows } = await admin.from("social_accounts").select("id").eq("provider", "instagram").eq("external_id", data.user_id).is("disconnected_at", null);
  for (const r of rows ?? []) await admin.rpc("social_disconnect", { p_social_account: r.id });
  return Response.json({ ok: true, disconnected: rows?.length ?? 0 });
}
