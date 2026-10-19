"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@core/lib/supabase/server";
import { createAdminClient } from "@core/lib/supabase/admin";
import { getCurrentUser } from "@core/lib/auth";
import { publicEnv } from "@core/lib/env";
import { createSignInLink } from "@core/lib/sign-in-link.mjs";
import { fill } from "@core/lib/i18n-shared";
import { getDict, type Dict } from "@/i18n";
import { doorErrorCode } from "@/lib/door";
import { OFFER_TEXT_FIELDS } from "@/lib/workspace";

/**
 * The workspace's writes (HANDOFF §5.3, B3), one action per form. Each one
 * reads its fields, lets SQL enforce the rules — the RPCs of migration 010
 * (mark_stage_step, set_week_test, record_test_result, invite_member,
 * remove_member) and the members-only policies on evidence, decisions, tests
 * and offers — and turns the code SQL raises into the person's words.
 * Nothing is trusted from the client: every gate is re-checked in the database.
 */
export type WsState = { error?: string; ok?: string; prompt?: "rescore" | "pass" | "triggerFired"; link?: { email: string; link: string; newLogin: boolean } } | undefined;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const intOrNull = (fd: FormData, k: string): number | null | "bad" => {
  const s = str(fd, k);
  if (!s) return null;
  if (!/^-?\d{1,9}$/.test(s)) return "bad";
  return Number.parseInt(s, 10);
};
const dateOrNull = (fd: FormData, k: string): string | null | "bad" => {
  const s = str(fd, k);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) return "bad";
  return s;
};
const eurosToCents = (fd: FormData, k: string): number | null | "bad" => {
  const s = str(fd, k).replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return "bad";
  return Math.round(n * 100);
};

async function begin(fd: FormData, section: string) {
  const id = str(fd, "account");
  if (!UUID.test(id)) redirect("/app");
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/v/${id}/${section}`);
  const [t, supabase] = await Promise.all([getDict(), createClient()]);
  return { id, user, t, supabase, path: `/app/v/${id}/${section}` };
}

/** A code the SQL raised → the person's words; a number in the detail fills {n}. */
function friendly(message: string | undefined, t: Dict): string {
  const m = (message ?? "").trim();
  const w = t.workspace.errors as Record<string, string>;
  if (m in w) return fill(w[m], { n: m.match(/\d+/)?.[0] ?? "" });
  const door = doorErrorCode(m);
  if (door) return fill(t.door.errors[door], { n: "" });
  if (/tests_one_open_idx/.test(m)) return w["tests.one_open"];
  if (/evidence_fact_has_source/.test(m)) return w.factNeedsSource;
  if (/row-level security/.test(m)) return w["workspace.off"];
  return w.generic;
}

function done(path: string, ok = "saved"): WsState {
  revalidatePath(path);
  revalidatePath(path.replace(/\/[a-z]+$/, "")); // the card shows the stage, the test, the next action
  return { ok };
}

// ---------------------------------------------------------------- stages

export async function markStageAction(_prev: WsState, fd: FormData): Promise<WsState> {
  const { id, t, supabase, path } = await begin(fd, "stages");
  const stage = Number.parseInt(str(fd, "stage"), 10);
  const step = str(fd, "step") === "exit" ? "exit" : "founder";
  const undo = str(fd, "undo") === "1";
  if (!(stage >= 1 && stage <= 8)) return { error: t.workspace.errors["stage.bad_step"] };
  const { error } = await supabase.rpc("mark_stage_step", {
    p_account: id, p_stage: stage, p_step: step, p_evidence: str(fd, "evidence") || null, p_done: !undo,
  });
  if (error) return { error: friendly(error.message, t) };
  return done(path);
}

// ---------------------------------------------------------------- ledger

export async function addEvidenceAction(_prev: WsState, fd: FormData): Promise<WsState> {
  const { id, user, t, supabase, path } = await begin(fd, "ledger");
  const claim = str(fd, "claim");
  if (!claim) return { error: t.workspace.errors.generic };
  const impact = intOrNull(fd, "impact"), uncertainty = intOrNull(fd, "uncertainty");
  if (impact === "bad" || uncertainty === "bad" || (impact !== null && (impact < 1 || impact > 5)) || (uncertainty !== null && (uncertainty < 1 || uncertainty > 5))) {
    return { error: t.workspace.errors.levelInvalid };
  }
  const source = str(fd, "source") || null;
  const sourceDate = dateOrNull(fd, "source_date");
  if (sourceDate === "bad") return { error: t.door.errors.dateInvalid };
  const isFact = Boolean(source && sourceDate);
  const { error } = await supabase.from("evidence").insert({
    account_id: id, kind: isFact ? "fact" : "assumption", claim, source, source_date: sourceDate,
    impact: impact ?? 3, uncertainty: uncertainty ?? (isFact ? 1 : 3), created_by: user.id,
  });
  if (error) return { error: friendly(error.message, t) };
  return done(path);
}

/** Promotion is a new fact row with promoted_from; the assumption's status becomes promoted (§5.2). */
export async function promoteEvidenceAction(_prev: WsState, fd: FormData): Promise<WsState> {
  const { id, user, t, supabase, path } = await begin(fd, "ledger");
  const from = str(fd, "evidence");
  const source = str(fd, "source");
  const sourceDate = dateOrNull(fd, "source_date");
  if (!UUID.test(from)) return { error: t.workspace.errors.generic };
  if (!source || !sourceDate || sourceDate === "bad") return { error: t.workspace.errors.factNeedsSource };
  const { data: old } = await supabase.from("evidence").select("claim, impact").eq("id", from).eq("account_id", id).maybeSingle();
  if (!old) return { error: t.workspace.errors.generic };
  const { error } = await supabase.from("evidence").insert({
    account_id: id, kind: "fact", claim: old.claim, source, source_date: sourceDate, impact: old.impact ?? 3, uncertainty: 1,
    promoted_from: from, created_by: user.id,
  });
  if (error) return { error: friendly(error.message, t) };
  await supabase.from("evidence").update({ status: "promoted" }).eq("id", from).eq("account_id", id);
  return done(path);
}

export async function killEvidenceAction(_prev: WsState, fd: FormData): Promise<WsState> {
  const { id, t, supabase, path } = await begin(fd, "ledger");
  const ev = str(fd, "evidence");
  if (!UUID.test(ev)) return { error: t.workspace.errors.generic };
  const { error } = await supabase.from("evidence").update({ status: "killed" }).eq("id", ev).eq("account_id", id);
  if (error) return { error: friendly(error.message, t) };
  return done(path);
}

// ---------------------------------------------------------------- decisions

export async function addDecisionAction(_prev: WsState, fd: FormData): Promise<WsState> {
  const { id, user, t, supabase, path } = await begin(fd, "decisions");
  const decision = str(fd, "decision");
  if (!decision) return { error: t.workspace.errors.generic };
  const decidedOn = dateOrNull(fd, "decided_on");
  if (decidedOn === "bad") return { error: t.door.errors.dateInvalid };
  const { error } = await supabase.from("decisions").insert({
    account_id: id, decision, reason: str(fd, "reason") || null, replaces: str(fd, "replaces") || null,
    decided_on: decidedOn ?? new Date().toISOString().slice(0, 10), decided_by: user.id,
  });
  if (error) return { error: friendly(error.message, t) };
  return done(path);
}

// ---------------------------------------------------------------- tests

/** Set a test: as the week's test through set_week_test() (moves the hours), else a plain row under the members policy. */
export async function setTestAction(_prev: WsState, fd: FormData): Promise<WsState> {
  const { id, user, t, supabase, path } = await begin(fd, "tests");
  const e = t.door.errors;
  const what = str(fd, "what");
  const deadline = dateOrNull(fd, "deadline");
  const pass = intOrNull(fd, "pass_number"), fail = intOrNull(fd, "fail_number"), cost = eurosToCents(fd, "cost");
  if (!what || deadline === null) return { error: e["door.go_needs_test"] };
  if (deadline === "bad") return { error: e.dateInvalid };
  if (pass === "bad" || fail === "bad" || pass === null || fail === null) return { error: e.numberInvalid };
  if (pass <= fail) return { error: e.passAboveFail };
  if (cost === "bad") return { error: e.numberInvalid };
  if (str(fd, "rules_read") !== "1") return { error: t.workspace.tests.rules.confirm };
  const test = { what, deadline, pass_number: pass, fail_number: fail, cost_cents: cost ?? 0, currency: "EUR" };
  if (str(fd, "week") === "1") {
    const force = str(fd, "force");
    const { error } = await supabase.rpc("set_week_test", { p_account: id, p_test: test, p_force: UUID.test(force) ? force : null });
    if (error) return { error: friendly(error.message, t) };
  } else {
    const { error } = await supabase.from("tests").insert({ account_id: id, ...test, started_at: new Date().toISOString(), created_by: user.id });
    if (error) return { error: friendly(error.message, t) };
  }
  return done(path);
}

/** Make the venture's open test the week's test (moves the hours here). */
export async function makeWeekTestAction(_prev: WsState, fd: FormData): Promise<WsState> {
  const { id, t, supabase, path } = await begin(fd, "tests");
  const force = str(fd, "force");
  const { error } = await supabase.rpc("set_week_test", { p_account: id, p_test: null, p_force: UUID.test(force) ? force : null });
  if (error) return { error: friendly(error.message, t) };
  return done(path);
}

export async function recordResultAction(_prev: WsState, fd: FormData): Promise<WsState> {
  const { id, t, supabase, path } = await begin(fd, "tests");
  const testId = str(fd, "test");
  const n = intOrNull(fd, "result");
  if (!UUID.test(testId)) return { error: t.workspace.errors["tests.not_found"] };
  if (n === null || n === "bad") return { error: t.workspace.errors["tests.number_required"] };
  const { data, error } = await supabase.rpc("record_test_result", { p_test: testId, p_number: n, p_changed: str(fd, "changed") || null });
  if (error) return { error: friendly(error.message, t) };
  const r = (data ?? {}) as { outcome?: string; prompt?: string | null; trigger_fired?: boolean };
  void id;
  const s = done(path);
  return { ...s, prompt: r.trigger_fired ? "triggerFired" : r.prompt === "rescore" ? "rescore" : "pass" };
}

// ---------------------------------------------------------------- offer

export async function saveOfferAction(_prev: WsState, fd: FormData): Promise<WsState> {
  const { id, user, t, supabase, path } = await begin(fd, "offer");
  const row: Record<string, unknown> = { account_id: id, updated_by: user.id };
  for (const f of OFFER_TEXT_FIELDS) row[f] = str(fd, f) || null;
  for (const [k, v] of [["price_cents", eurosToCents(fd, "price")], ["unit_cost_cents", eurosToCents(fd, "unit_cost")], ["unit_margin_cents", eurosToCents(fd, "unit_margin")], ["cac_cents", eurosToCents(fd, "cac")]] as const) {
    if (v === "bad") return { error: t.door.errors.numberInvalid };
    row[k] = v;
  }
  const wtpPass = intOrNull(fd, "wtp_pass_number"), wtpResult = intOrNull(fd, "wtp_result"), wtpDeadline = dateOrNull(fd, "wtp_deadline");
  if (wtpPass === "bad" || wtpResult === "bad") return { error: t.door.errors.numberInvalid };
  if (wtpDeadline === "bad") return { error: t.door.errors.dateInvalid };
  row.wtp_pass_number = wtpPass; row.wtp_result = wtpResult; row.wtp_deadline = wtpDeadline;
  row.objections = str(fd, "objections").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [objection, ...rest] = l.split(/\s[—–-]\s/);
    return { objection: objection.trim(), answer: rest.join(" — ").trim() };
  });
  const { error } = await supabase.from("offers").upsert(row, { onConflict: "account_id" });
  if (error) return { error: friendly(error.message, t) };
  return done(path);
}

// ---------------------------------------------------------------- team

/**
 * Invite one person (§5.3): the membership is written first as `invited`
 * (invite_member re-checks the owner, the plan's members_max and the workspace in
 * SQL), then the one-time sign-in link is made with core's createSignInLink —
 * the same code as Admin → Invite a tester. Nothing is sent; the owner sends it.
 * The address needs a login before the membership can point at it, so the link
 * (which creates the login) comes first and the membership right after; a refusal
 * in SQL then leaves a login with no membership, which sees nothing.
 */
export async function inviteMemberAction(_prev: WsState, fd: FormData): Promise<WsState> {
  const { id, t, supabase, path } = await begin(fd, "team");
  const w = t.workspace.errors;
  const email = str(fd, "email").toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return { error: w.emailInvalid };
  // the cheap refusals first, before any login is created
  const { data: allowed, error: gateError } = await supabase.rpc("has_feature", { p_account: id, p_key: "venture.workspace" });
  if (gateError || !allowed) return { error: w["workspace.off"] };
  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch {
    return { error: w.noServerKey };
  }
  // a founder login is never invited this way (it would hand out a superadmin's sign-in link)
  const pattern = email.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: existing } = await admin.from("users").select("is_superadmin").ilike("email", pattern).limit(1);
  if (existing?.[0]?.is_superadmin) return { error: w.emailInvalid };
  let made: { link: string; userId: string; newLogin: boolean };
  try {
    made = await createSignInLink(admin, email, publicEnv.siteUrl);
  } catch (e) {
    return { error: fill(w.linkRefused, { message: e instanceof Error ? e.message : String(e) }) };
  }
  const { error } = await supabase.rpc("invite_member", { p_account: id, p_user: made.userId, p_email: email });
  if (error) return { error: friendly(error.message, t) };
  revalidatePath(path);
  return { ok: "invited", link: { email, link: made.link, newLogin: made.newLogin } };
}

export async function removeMemberAction(_prev: WsState, fd: FormData): Promise<WsState> {
  const { id, t, supabase, path } = await begin(fd, "team");
  const userId = str(fd, "user");
  if (!UUID.test(userId)) return { error: t.workspace.errors.generic };
  const { error } = await supabase.rpc("remove_member", { p_account: id, p_user: userId });
  if (error) return { error: friendly(error.message, t) };
  return done(path, "removed");
}
