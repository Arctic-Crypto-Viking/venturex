import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dimension, Verdict, VentureState } from "./door";

/**
 * The read model of a venture: one row of the `venture_card` view (HANDOFF
 * §4.6), members only through RLS. Everything the home page, the card page and
 * View as show comes from here; nothing is computed in the UI beyond grouping.
 */
export type VentureCard = {
  account_id: string;
  account_name: string;
  slug: string;
  owner_user_id: string;
  title: string;
  customer: string | null;
  uses_today: string | null;
  ship_in_30_days: string | null;
  unfair_reach: string | null;
  assets: string | null;
  channel_has: string | null;
  channel_needs: string | null;
  calendar: string | null;
  unblocker: string | null;
  market: string | null;
  language: string | null;
  hours_per_week: number | null;
  state: VentureState;
  state_basis: "scored" | "declared" | null;
  state_since: string | null;
  state_reason: string | null;
  has_hours: boolean;
  stage: number | null;
  stage_since: string | null;
  next_action: string | null;
  next_date: string | null;
  money_in_cents: number;
  committed_cents: number;
  committed_hours: number | null;
  revival_trigger: string | null;
  revival_number: number | null;
  revival_deadline: string | null;
  forecast_public: boolean;
  run_id: string | null;
  run_at: string | null;
  rules_version: number | null;
  verdict: Verdict | null;
  total: number | null;
  killed_at_gate: number | null;
  demand_capped: boolean | null;
  fact_changed: string | null;
  gate_1: boolean | null; gate_1_note: string | null;
  gate_2: boolean | null; gate_2_note: string | null;
  gate_3: boolean | null; gate_3_note: string | null;
  gate_4: boolean | null; gate_4_note: string | null;
  gate_5: boolean | null; gate_5_note: string | null;
  score_demand: number | null;
  score_time: number | null;
  score_price: number | null;
  score_edge: number | null;
  score_margin: number | null;
  test_id: string | null;
  test_what: string | null;
  test_deadline: string | null;
  test_pass: number | null;
  test_fail: number | null;
  test_result: number | null;
  test_outcome: "pass" | "fail" | "middle" | null;
  is_week_test: boolean | null;
  to_confirm: boolean;
  created_at: string;
  updated_at: string;
};

export type DoorRunRow = {
  id: string; created_at: string; rules_version: number; verdict: Verdict; total: number | null; killed_at_gate: number | null; fact_changed: string | null;
};

const SCORE_COLUMNS: Record<Dimension, keyof VentureCard> = {
  demand: "score_demand", time: "score_time", price: "score_price", edge: "score_edge", margin: "score_margin",
};

export function scoresOf(v: VentureCard): Record<Dimension, number> | null {
  if (v.score_demand == null) return null;
  return {
    demand: v.score_demand, time: v.score_time ?? 0, price: v.score_price ?? 0, edge: v.score_edge ?? 0, margin: v.score_margin ?? 0,
  };
}
export { SCORE_COLUMNS };

/** Every venture the person is a member of, live first, then parked, untriaged, killed; newest first inside a state. */
export async function loadMyVentures(supabase: SupabaseClient): Promise<VentureCard[]> {
  const { data } = await supabase.from("venture_card").select("*").order("updated_at", { ascending: false });
  const rows = (data ?? []) as VentureCard[];
  const order: Record<VentureState, number> = { live: 0, parked: 1, untriaged: 2, killed: 3 };
  return rows.sort((a, b) => (order[a.state] - order[b.state]) || (b.has_hours ? 1 : 0) - (a.has_hours ? 1 : 0));
}

export async function loadVenture(supabase: SupabaseClient, accountId: string): Promise<VentureCard | null> {
  const { data } = await supabase.from("venture_card").select("*").eq("account_id", accountId).maybeSingle();
  return (data as VentureCard | null) ?? null;
}

export async function loadRuns(supabase: SupabaseClient, accountId: string): Promise<DoorRunRow[]> {
  const { data } = await supabase
    .from("door_runs")
    .select("id, created_at, rules_version, verdict, total, killed_at_gate, fact_changed")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  return (data ?? []) as DoorRunRow[];
}

/** "2 of 3 live · hours on X": the owner's cap line, from the ventures they own. */
export function capOf(ventures: VentureCard[], userId: string) {
  const mine = ventures.filter((v) => v.owner_user_id === userId);
  const live = mine.filter((v) => v.state === "live");
  return { live: live.length, hours: live.find((v) => v.has_hours) ?? null, saved: mine.length };
}

export function fmtDate(iso: string | null | undefined, locale = "en"): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: iso.length === 10 ? "UTC" : undefined }).format(d);
}
