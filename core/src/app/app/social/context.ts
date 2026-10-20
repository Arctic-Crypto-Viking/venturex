import { redirect } from "next/navigation";
import { createClient } from "@core/lib/supabase/server";
import { getCurrentAccount, getCurrentUser } from "@core/lib/auth";
import { getEntitlements, hasFeature, type Entitlements } from "@core/lib/entitlements";
import { getCoreDict, type CoreDict } from "@core/i18n";
import { loadConnections, type Connection } from "@core/lib/social/db";
import { product } from "@product";
import type { SocialActor } from "@core/product";

export const SOCIAL_PATH = "/app/social";
/** The Promote screen (phase 2); a constant here because a "use server" file may export only functions. */
export const PROMOTE_PATH = `${SOCIAL_PATH}/promote`;

export type SocialContext = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  account: NonNullable<Awaited<ReturnType<typeof getCurrentAccount>>>;
  supabase: Awaited<ReturnType<typeof createClient>>;
  actors: SocialActor[];
  actor: SocialActor;
  connections: Connection[];
  ent: Entitlements;
  canPublish: boolean;
  dict: CoreDict;
};

/**
 * What every Social screen starts from: the signed-in member, their account, the
 * actor they work as (product.social.currentActorId, falling back to the first
 * one), that actor's connections, the plan. A product without the `social` slot
 * has no Social section: 404-like redirect home.
 */
export async function loadSocial(path = SOCIAL_PATH, actorId: string | null = null): Promise<SocialContext> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  const account = await getCurrentAccount();
  if (!account || !product.social) redirect(product.signupPath ?? product.homePath);
  const supabase = await createClient();
  const [actors, ent, dict, wanted] = await Promise.all([
    product.social.actors(supabase, account.id),
    getEntitlements(supabase, account.id),
    getCoreDict(),
    product.social.currentActorId?.() ?? Promise.resolve(null),
  ]);
  // a screen that works on one actor's thing (a trigger's plan) names the actor; otherwise the cookie's, else the first
  const actor = actors.find((a) => a.id === (actorId ?? wanted)) ?? actors[0];
  if (!actor) redirect(product.signupPath ?? product.homePath);
  const connections = await loadConnections(supabase, account.id, actor.id);
  return { user, account, supabase, actors, actor, connections, ent, canPublish: hasFeature(ent, "social.publish"), dict };
}

/** One connection the actor owns, or null (never trusts an id from the browser). */
export function ownConnection(ctx: SocialContext, id: string | null | undefined): Connection | null {
  return ctx.connections.find((c) => c.id === id) ?? null;
}
