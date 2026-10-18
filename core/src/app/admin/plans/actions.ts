"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@core/lib/supabase/server";
import { getCurrentUser } from "@core/lib/auth";

export type MatrixState = { ok?: string; error?: string } | undefined;

/**
 * Plan × feature edit (spec §6 "Modules & features"). The RPC re-checks
 * users.is_superadmin in SQL, validates the value against the feature kind and
 * the audit trigger records the superadmin as the actor.
 */
export async function setPlanFeatureAction(_prev: MatrixState, fd: FormData): Promise<MatrixState> {
  const user = await getCurrentUser();
  if (!user?.isSuperadmin) return { error: "Not allowed." };
  const plan = String(fd.get("plan") ?? "");
  const feature = String(fd.get("feature") ?? "");
  const kind = String(fd.get("kind") ?? "");
  const raw = String(fd.get("value") ?? "").trim();

  let value: unknown;
  if (kind === "flag") {
    value = raw === "true" || raw === "on";
  } else if (/^-?\d+$/.test(raw)) {
    value = Number.parseInt(raw, 10);
  } else if (raw.startsWith("{")) {
    try { value = JSON.parse(raw); } catch { return { error: `${feature}: not valid JSON.` }; }
  } else if (raw === "" || /^unlimited$/i.test(raw)) {
    value = -1;
  } else {
    return { error: `${feature}: use a whole number, -1 for unlimited, or {"limit": n, "period": "lifetime"}.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_plan_feature", { p_plan_key: plan, p_feature_key: feature, p_value: value });
  if (error) return { error: `${feature} / ${plan}: ${error.message}` };
  revalidatePath("/admin/plans");
  return { ok: `${feature} / ${plan} saved` };
}
