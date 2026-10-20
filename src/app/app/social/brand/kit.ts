import { ensureBrandKit, type BrandKit } from "@core/lib/social/db";
import { colourFromLogo } from "@core/lib/social/render";
import type { SocialContext } from "../context";

/** The actor's brand kit, created from the product's actor the first time it is needed (logo colour picked by sharp). */
export async function ensureKit(ctx: SocialContext): Promise<BrandKit> {
  const kit = await ensureBrandKit(ctx.supabase, ctx.account.id, ctx.actor, colourFromLogo);
  // the logo follows the product's actor (its logo of record, also set from this page through
  // product.social.logoUpload); a kit keeps its own logo only while the actor has none
  if (ctx.actor.logoUrl && kit.logo_url !== ctx.actor.logoUrl) {
    await ctx.supabase.from("social_brand_kits").update({ logo_url: ctx.actor.logoUrl }).eq("id", kit.id);
    kit.logo_url = ctx.actor.logoUrl;
  }
  return kit;
}
