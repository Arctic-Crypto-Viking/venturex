import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@core/lib/supabase/admin";

/**
 * GET /api/internal/overview — spec §7.
 * Read by the founder's "My ventures" page. Requires the INTERNAL_API_TOKEN
 * (Authorization: Bearer …). The internal account is excluded from every figure
 * inside public.internal_overview(). Returns 404 (not 401) when the token is
 * wrong or missing, so the endpoint does not advertise itself.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.INTERNAL_API_TOKEN;
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !got || !timingSafeEqual(got, expected)) {
    return new NextResponse(null, { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("internal_overview");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "private, no-store",
      "Access-Control-Allow-Origin": "https://claude.ai",
    },
  });
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
