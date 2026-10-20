import { NextResponse, type NextRequest } from "next/server";
import type { Template } from "@core/lib/social/db";
import { renderTemplate } from "@core/lib/social/render";
import { isOwnUpload } from "@core/lib/social/storage";
import { loadSocial, SOCIAL_PATH } from "@core/app/app/social/context";
import { ensureKit } from "@core/app/app/social/brand/kit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREVIEW_WIDTH = 540;

/**
 * The post editor's live preview (20 Oct 2026): the template drawn with the words
 * typed so far and the actor's brand kit, by the same renderer as the post, at half
 * width. Nothing is stored. The template is read with the member's RLS, and a
 * `photo` slot is fetched only when it points into the account's own folder of the
 * `social` bucket (the server never fetches a URL the browser chose otherwise).
 */
export async function POST(request: NextRequest) {
  const ctx = await loadSocial(`${SOCIAL_PATH}/new`);
  const body = (await request.json().catch(() => null)) as { template?: unknown; slots?: unknown } | null;
  const id = typeof body?.template === "string" ? body.template : "";
  if (!UUID.test(id)) return new NextResponse("template", { status: 400 });
  const { data } = await ctx.supabase.from("social_templates").select("*").eq("id", id).eq("is_active", true).maybeSingle();
  const template = data as Template | null;
  if (!template) return new NextResponse("template", { status: 404 });

  const given = body?.slots && typeof body.slots === "object" ? (body.slots as Record<string, unknown>) : {};
  const values: Record<string, string> = {};
  for (const s of template.slots) {
    const v = typeof given[s] === "string" ? (given[s] as string).slice(0, s === "lineup" ? 600 : 200) : "";
    values[s] = s === "photo" && v && !isOwnUpload(ctx.account.id, v) ? "" : v;
  }
  try {
    const kit = await ensureKit(ctx);
    const out = await renderTemplate({ layout: template.layout, format: template.format, values, brand: kit, width: PREVIEW_WIDTH });
    return new NextResponse(new Uint8Array(out.jpeg), { headers: { "content-type": "image/jpeg", "cache-control": "private, no-store" } });
  } catch (e) {
    console.error("social: preview", e);
    return new NextResponse("render", { status: 500 });
  }
}
