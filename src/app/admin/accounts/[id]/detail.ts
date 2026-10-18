import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Core shape of public.admin_account_detail(). A product adds its own keys to the
 * same JSON (e.g. the artist platform's `identities`) and reads them by widening
 * the type: `detail as AccountDetail & { identities: … }`.
 */
export type AccountDetail = {
  account: {
    id: string; name: string; slug: string; access_status: string; is_internal: boolean; country: string | null;
    currency: string; locale: string; trial_ends_at: string | null; admin_notes: string | null; created_at: string;
    wizard_state: Record<string, unknown>;
  };
  owner: { id: string; email: string | null; display_name: string | null; is_superadmin: boolean } | null;
  members: Array<{ user_id: string; email: string | null; role: string; status: string }>;
  subscription: {
    id: string; status: string; term_months: number; paid_through: string | null; current_period_end: string | null;
    provider: string; plan_key: string; plan_name: string; grace_days: number;
  } | null;
  plan: { key: string; name: string } | null;
  entitled: boolean;
  entitlements: Record<string, unknown>;
  overrides: Array<{ feature_key: string; value: unknown; reason: string | null; expires_at: string | null }>;
  usage: Array<{ feature_key: string; period_start: string; used: number }>;
  view_as_sessions: Array<{ id: string; admin_email: string | null; reason: string | null; started_at: string; ended_at: string | null }>;
  audit: Array<{ id: number; at: string; action: string; entity_type: string; actor_role: string | null; actor_user_id: string | null }>;
} & Record<string, unknown>;

export async function loadAccountDetail(supabase: SupabaseClient, accountId: string): Promise<AccountDetail | null> {
  const { data, error } = await supabase.rpc("admin_account_detail", { p_account: accountId });
  if (error || !data) return null;
  return data as AccountDetail;
}
