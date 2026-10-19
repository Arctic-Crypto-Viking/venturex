import "server-only";

import { notFound, redirect } from "next/navigation";
import { createClient } from "@core/lib/supabase/server";
import { getCurrentUser } from "@core/lib/auth";
import { featureValue, getEntitlements, type Entitlements } from "@core/lib/entitlements";
import { getLocale } from "@core/lib/i18n";
import { getDict } from "@/i18n";
import { loadVenture, type VentureCard } from "@/lib/ventures";
import { workspaceOn } from "@/lib/workspace";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What every workspace screen starts from: the signed-in person, the venture
 * (through RLS: a non-member gets a 404, never a hint), the account's
 * entitlements and whether the workspace is on for this plan. The screens show
 * or hide on `on`; every write re-checks in SQL (rule 2).
 */
export async function loadWorkspace(id: string, path: string) {
  if (!UUID.test(id)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  const supabase = await createClient();
  const [v, t, locale] = await Promise.all([loadVenture(supabase, id), getDict(), getLocale()]);
  if (!v) notFound();
  let ent: Entitlements = {};
  try {
    ent = await getEntitlements(supabase, id);
  } catch {
    ent = {};
  }
  return {
    user, supabase, v: v as VentureCard, t, locale, ent,
    on: workspaceOn(ent),
    membersMax: featureValue(ent, "venture.members_max"),
    isOwner: v.owner_user_id === user.id,
  };
}
