import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Entitlements are DATA (spec D4). The database resolves them:
 *   account override → effective plan value → feature default
 * via public.effective_entitlements(account_id). This module only reads the
 * resolved payload and answers "is this on?" / "how many?" questions.
 *
 * The client uses these answers to show or hide UI. Every gated server action
 * re-checks with consume_quota() / has_feature() in SQL before doing the work.
 */
export type Entitlements = Record<string, unknown>;

/** Feature keys are `<module>.<name>` (PLATFORM-CORE §4 rule 3); which keys exist is product data. */
export type FeatureKey = `${string}.${string}`;

export const UNLIMITED = -1;

/** Fetch the resolved entitlements for an account the current user belongs to. */
export async function getEntitlements(
  supabase: SupabaseClient,
  accountId: string,
): Promise<Entitlements> {
  const { data, error } = await supabase.rpc("effective_entitlements", { p_account: accountId });
  if (error) throw new Error(`effective_entitlements: ${error.message}`);
  return (data ?? {}) as Entitlements;
}

/** Numeric value of a limit/quota (-1 = unlimited). Objects like {limit, period} collapse to limit. */
export function featureValue(ent: Entitlements, key: FeatureKey): number {
  const v = ent[key];
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object" && v !== null && "limit" in v) {
    const n = Number((v as { limit: unknown }).limit);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Flag on, or limit/quota > 0 or unlimited. */
export function hasFeature(ent: Entitlements, key: FeatureKey): boolean {
  const v = ent[key];
  if (typeof v === "boolean") return v;
  const n = featureValue(ent, key);
  return n === UNLIMITED || n > 0;
}

/** Server-side gate for a metered action. Increments usage atomically or says no. */
export async function consumeQuota(
  supabase: SupabaseClient,
  args: {
    accountId: string;
    featureKey: FeatureKey;
    quantity?: number;
    identityId?: string;
    refType?: string;
    refId?: string;
    costUsdMicro?: number;
    model?: string;
    tokensIn?: number;
    tokensOut?: number;
  },
): Promise<{ allowed: boolean; source: string; used?: number; limit?: number; reason?: string }> {
  const { data, error } = await supabase.rpc("consume_quota", {
    p_account: args.accountId,
    p_feature_key: args.featureKey,
    p_quantity: args.quantity ?? 1,
    p_identity: args.identityId ?? null,
    p_ref_type: args.refType ?? null,
    p_ref_id: args.refId ?? null,
    p_cost_usd_micro: args.costUsdMicro ?? 0,
    p_model: args.model ?? null,
    p_tokens_in: args.tokensIn ?? null,
    p_tokens_out: args.tokensOut ?? null,
  });
  if (error) throw new Error(`consume_quota: ${error.message}`);
  return data as { allowed: boolean; source: string; used?: number; limit?: number; reason?: string };
}
