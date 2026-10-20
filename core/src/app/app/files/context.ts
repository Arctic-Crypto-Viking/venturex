import { redirect } from "next/navigation";
import { createClient } from "@core/lib/supabase/server";
import { getCurrentAccount, getCurrentUser } from "@core/lib/auth";
import { getEntitlements, hasFeature, type Entitlements } from "@core/lib/entitlements";
import { getCoreDict, type CoreDict } from "@core/i18n";
import { loadSources, type Source } from "@core/lib/files/db";
import { loadConnections, type Connection } from "@core/lib/social/db";
import { product } from "@product";
import type { SocialActor } from "@core/product";

export const FILES_PATH = "/app/files";

export type FilesContext = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  account: NonNullable<Awaited<ReturnType<typeof getCurrentAccount>>>;
  supabase: Awaited<ReturnType<typeof createClient>>;
  actors: SocialActor[];
  actor: SocialActor;
  sources: Source[];
  /** Instagram connections of the actor (for "Use in a post"); empty in a product without Social. */
  connections: Connection[];
  ent: Entitlements;
  canPublish: boolean;
  dict: CoreDict;
};

/**
 * What every Library screen starts from: the signed-in member, their account,
 * the actor they work as (the product's social hook when it has one, else the
 * account itself), the account's sources, the plan. The Library exists in every
 * product that pulls core; Social is optional on top of it.
 */
export async function loadFiles(path = FILES_PATH): Promise<FilesContext> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  const account = await getCurrentAccount();
  if (!account) redirect(product.signupPath ?? product.homePath);
  const supabase = await createClient();
  const [actors, ent, dict, wanted, sources] = await Promise.all([
    product.social ? product.social.actors(supabase, account.id) : Promise.resolve<SocialActor[]>([{ id: account.id, name: account.name, logoUrl: null, links: {}, tags: [], language: null }]),
    getEntitlements(supabase, account.id),
    getCoreDict(),
    product.social?.currentActorId?.() ?? Promise.resolve(null),
    loadSources(supabase, account.id),
  ]);
  const actor = actors.find((a) => a.id === wanted) ?? actors[0];
  if (!actor) redirect(product.signupPath ?? product.homePath);
  const connections = product.social ? await loadConnections(supabase, account.id, actor.id) : [];
  return { user, account, supabase, actors, actor, sources, connections, ent, canPublish: hasFeature(ent, "social.publish"), dict };
}

/** One source of the account, or null (never trusts an id from the browser). */
export function ownSource(ctx: FilesContext, id: string | null | undefined): Source | null {
  return ctx.sources.find((s) => s.id === id) ?? null;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
