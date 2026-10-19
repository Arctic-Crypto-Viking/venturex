import type { SupabaseClient } from "@supabase/supabase-js";
import { hasFeature, type Entitlements } from "@core/lib/entitlements";
import { STAGE_COUNT } from "./door";

/**
 * The workspace's read side (HANDOFF §5.2, B3): the rows behind
 * /app/v/[id]/{stages,ledger,decisions,tests,offer,team}. Every table is read
 * through RLS as the signed-in member; nothing is computed here beyond
 * grouping. Writes go through the RPCs of migration 010 or the members-only
 * policies (evidence, decisions, tests, offers), from src/app/app/v/[id]/actions.ts.
 */

export type StageProgressRow = {
  account_id: string; stage: number; entered_at: string; founder_step_done_at: string | null;
  evidence: string | null; exit_passed_at: string | null; updated_at: string;
};
export type StageHistoryRow = { id: string; from_stage: number | null; to_stage: number | null; source: string; changed_at: string };
export type EvidenceRow = {
  id: string; kind: "fact" | "assumption" | "killed"; claim: string; source: string | null; source_date: string | null;
  impact: number | null; uncertainty: number | null; risk: number | null; test_id: string | null;
  status: "open" | "promoted" | "killed"; promoted_from: string | null; created_at: string;
};
export type DecisionRow = { id: string; decided_on: string; decision: string; reason: string | null; replaces: string | null; created_at: string };
export type TestRow = {
  id: string; what: string; cost_cents: number; currency: string; deadline: string; pass_number: number; fail_number: number;
  set_at: string; started_at: string | null; result_number: number | null; result_at: string | null;
  outcome: "pass" | "fail" | "middle" | null; changed_one_thing: string | null; is_week_test: boolean; status: "open" | "done";
};
export type OfferRow = {
  account_id: string; customer: string | null; problem: string | null; promise: string | null; deliverable: string | null;
  price_cents: number | null; currency: string; anchored_against: string | null; proof: string | null; risk_reversal: string | null;
  objections: Array<{ objection: string; answer: string }>; unit_cost_cents: number | null; unit_margin_cents: number | null;
  cac_cents: number | null; wtp_instrument: string | null; wtp_pass_number: number | null; wtp_deadline: string | null; wtp_result: number | null;
  updated_at: string;
};
export type MemberRow = { user_id: string; role: string; status: string; invited_email: string | null; accepted_at: string | null; created_at: string };

export const OFFER_TEXT_FIELDS = ["customer", "problem", "promise", "deliverable", "anchored_against", "proof", "risk_reversal", "wtp_instrument"] as const;
export type OfferTextField = (typeof OFFER_TEXT_FIELDS)[number];

export function workspaceOn(ent: Entitlements): boolean {
  return hasFeature(ent, "venture.workspace");
}

export const STAGES = Array.from({ length: STAGE_COUNT }, (_, i) => i + 1);

export async function loadStages(supabase: SupabaseClient, accountId: string) {
  const [{ data: progress }, { data: history }] = await Promise.all([
    supabase.from("stage_progress").select("*").eq("account_id", accountId).order("stage"),
    supabase.from("stage_history").select("id, from_stage, to_stage, source, changed_at").eq("account_id", accountId).order("changed_at", { ascending: false }),
  ]);
  return { progress: (progress ?? []) as StageProgressRow[], history: (history ?? []) as StageHistoryRow[] };
}

/** Open assumptions by risk (highest first), then facts, then killed. */
export async function loadLedger(supabase: SupabaseClient, accountId: string): Promise<EvidenceRow[]> {
  const { data } = await supabase.from("evidence").select("*").eq("account_id", accountId).order("created_at", { ascending: false });
  const rows = (data ?? []) as EvidenceRow[];
  const rank = (e: EvidenceRow) => (e.status === "open" && e.kind === "assumption" ? 0 : e.kind === "fact" && e.status !== "killed" ? 1 : e.status === "promoted" ? 2 : 3);
  return rows.sort((a, b) => rank(a) - rank(b) || (b.risk ?? 0) - (a.risk ?? 0));
}

export async function loadDecisions(supabase: SupabaseClient, accountId: string): Promise<DecisionRow[]> {
  const { data } = await supabase.from("decisions").select("*").eq("account_id", accountId).order("decided_on", { ascending: false }).order("created_at", { ascending: false });
  return (data ?? []) as DecisionRow[];
}

export async function loadTests(supabase: SupabaseClient, accountId: string): Promise<TestRow[]> {
  const { data } = await supabase.from("tests").select("*").eq("account_id", accountId).order("set_at", { ascending: false });
  return (data ?? []) as TestRow[];
}

export async function loadOffer(supabase: SupabaseClient, accountId: string): Promise<OfferRow | null> {
  const { data } = await supabase.from("offers").select("*").eq("account_id", accountId).maybeSingle();
  return (data as OfferRow | null) ?? null;
}

export async function loadMembers(supabase: SupabaseClient, accountId: string): Promise<MemberRow[]> {
  const { data } = await supabase.from("account_members").select("user_id, role, status, invited_email, accepted_at, created_at").eq("account_id", accountId).order("created_at");
  return (data ?? []) as MemberRow[];
}

/** The week's open test across the ventures a person can see, if any. */
export function weekTestOf(tests: TestRow[]): TestRow | null {
  return tests.find((t) => t.status === "open" && t.is_week_test) ?? null;
}
export function openTestOf(tests: TestRow[]): TestRow | null {
  return tests.find((t) => t.status === "open") ?? null;
}

/** Weeks a venture has stood at its stage; four or more is a stall (§4.3). */
export function weeksAtStage(stageSince: string | null | undefined, now = new Date()): number | null {
  if (!stageSince) return null;
  const since = new Date(`${stageSince}T00:00:00Z`).getTime();
  if (Number.isNaN(since)) return null;
  return Math.floor((now.getTime() - since) / (7 * 86400000));
}
export const STALL_WEEKS = 4;
