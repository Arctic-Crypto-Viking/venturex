import type { NextRequest } from "next/server";
import { createAdminClient } from "@core/lib/supabase/admin";
import { publicEnv } from "@core/lib/env";
import { parseSignedRequest } from "@core/lib/social/meta-signed-request";
import { product } from "@product";

/**
 * Meta's Data Deletion Request callback (SOCIAL-MANAGER §9 step 9): the person
 * asked Instagram to have their data deleted from the app. The connection row
 * goes (cascade: its posts, log and insights; the trigger removes the Vault
 * secret). Meta expects { url, confirmation_code }; the URL is the privacy page,
 * which says what deletion means here.
 */
export async function POST(request: NextRequest) {
  const fd = await request.formData().catch(() => null);
  const data = parseSignedRequest(fd?.get("signed_request")?.toString(), process.env.INSTAGRAM_APP_SECRET);
  if (!data?.user_id) return new Response("Bad signed_request", { status: 400 });
  const admin = createAdminClient();
  const { data: rows } = await admin.from("social_accounts").select("id, account_id").eq("provider", "instagram").eq("external_id", data.user_id);
  for (const r of rows ?? []) {
    await admin.from("social_accounts").delete().eq("id", r.id);
    await admin.rpc("log_audit", { p_action: "social_data_deletion", p_entity_type: "social_accounts", p_entity_id: r.id, p_account: r.account_id, p_before: null, p_after: { provider: "instagram" } });
  }
  const code = `ig-${data.user_id}-${Date.now().toString(36)}`;
  return Response.json({ url: `${publicEnv.siteUrl}${product.privacyPath ?? "/"}`, confirmation_code: code });
}
