"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Button, ButtonLink, Card, Field, Input, Notice, Select, Textarea } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import type { Dict } from "@/i18n/en";
import type { TestRule } from "@/lib/test-rules";
import type { EvidenceRow, MemberRow, OfferRow, TestRow } from "@/lib/workspace";
import {
  addDecisionAction, addEvidenceAction, inviteMemberAction, killEvidenceAction, makeWeekTestAction, markStageAction,
  promoteEvidenceAction, recordResultAction, removeMemberAction, saveOfferAction, setTestAction, type WsState,
} from "./actions";

/**
 * The workspace's forms (B3): plain <form>s posting to one server action each,
 * phone first, the error or the outcome under the button. Copy comes from the
 * dictionary the page hands down; no words live here.
 */
type Action = (prev: WsState, fd: FormData) => Promise<WsState>;
type W = Dict["workspace"];

function Outcome({ state, okText }: { state: WsState; okText?: string }) {
  if (state?.error) return <Notice tone="danger">{state.error}</Notice>;
  if (state?.ok && okText) return <Notice tone="success">{okText}</Notice>;
  return null;
}

function useForm(action: Action) {
  return useActionState(action, undefined);
}

// ---------------------------------------------------------------- stages

export function StageStepForm({ account, stage, step, done, evidence, w }: {
  account: string; stage: number; step: "founder" | "exit"; done: boolean; evidence: string | null; w: W["stages"];
}) {
  const [state, formAction, pending] = useForm(markStageAction);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="account" value={account} />
      <input type="hidden" name="stage" value={stage} />
      <input type="hidden" name="step" value={step} />
      {done ? <input type="hidden" name="undo" value="1" /> : null}
      {!done ? (
        <Field label={w.evidence}><Textarea name="evidence" defaultValue={evidence ?? ""} placeholder={w.evidencePlaceholder} rows={2} maxLength={2000} /></Field>
      ) : null}
      <Outcome state={state} />
      <Button type="submit" variant={done ? "ghost" : step === "founder" ? "primary" : "secondary"} size={done ? "sm" : "md"} disabled={pending}>
        {done ? w.undo : step === "founder" ? w.markDone : w.markExit}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------- ledger

export function AddEvidenceForm({ account, w }: { account: string; w: W["ledger"] }) {
  const [state, formAction, pending] = useForm(addEvidenceAction);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="account" value={account} />
      <Field label={w.claim}><Textarea name="claim" placeholder={w.claimPlaceholder} required rows={2} maxLength={2000} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={w.impact}><Select name="impact" defaultValue="3">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
        <Field label={w.uncertainty}><Select name="uncertainty" defaultValue="3">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={w.source}><Input name="source" placeholder={w.sourcePlaceholder} maxLength={400} /></Field>
        <Field label={w.sourceDate}><Input name="source_date" type="date" /></Field>
      </div>
      <p className="text-xs text-muted">{w.promoteHint}</p>
      <Outcome state={state} />
      <Button type="submit" disabled={pending}>{w.save}</Button>
    </form>
  );
}

export function PromoteForm({ account, row, w }: { account: string; row: EvidenceRow; w: W["ledger"] }) {
  const [state, formAction, pending] = useForm(promoteEvidenceAction);
  const [open, setOpen] = useState(false);
  if (!open) return <Button type="button" variant="soft" size="sm" onClick={() => setOpen(true)}>{w.promote}</Button>;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="account" value={account} />
      <input type="hidden" name="evidence" value={row.id} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label={w.source}><Input name="source" placeholder={w.sourcePlaceholder} required maxLength={400} /></Field>
        <Field label={w.sourceDate}><Input name="source_date" type="date" required /></Field>
      </div>
      <Outcome state={state} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{w.promote}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>×</Button>
      </div>
    </form>
  );
}

export function KillEvidenceForm({ account, row, w }: { account: string; row: EvidenceRow; w: W["ledger"] }) {
  const [state, formAction, pending] = useForm(killEvidenceAction);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="account" value={account} />
      <input type="hidden" name="evidence" value={row.id} />
      <Outcome state={state} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>{w.kill}</Button>
    </form>
  );
}

// ---------------------------------------------------------------- decisions

export function DecisionForm({ account, w, today }: { account: string; w: W["decisions"]; today: string }) {
  const [state, formAction, pending] = useForm(addDecisionAction);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="account" value={account} />
      <Field label={w.decidedOn}><Input name="decided_on" type="date" defaultValue={today} required /></Field>
      <Field label={w.decision}><Textarea name="decision" placeholder={w.decisionPlaceholder} required rows={2} maxLength={4000} /></Field>
      <Field label={w.reason}><Textarea name="reason" placeholder={w.reasonPlaceholder} rows={2} maxLength={4000} /></Field>
      <Field label={w.replaces}><Input name="replaces" placeholder={w.replacesPlaceholder} maxLength={1000} /></Field>
      <Outcome state={state} />
      <Button type="submit" disabled={pending}>{w.save}</Button>
    </form>
  );
}

// ---------------------------------------------------------------- tests

export function RulesChecklist({ rules, w }: { rules: TestRule[]; w: W["tests"]["rules"] }) {
  return (
    <Card tone="warn" className="flex flex-col gap-3">
      <p className="text-[15px] font-semibold">{w.title}</p>
      <p className="text-sm text-muted">{w.sub}</p>
      <ul className="flex flex-col gap-2 text-sm">
        {rules.map((r) => (
          <li key={r.key}>
            <span className="font-medium">{w.items[r.key].label}</span>
            <span className="block text-muted">{w.items[r.key].body}</span>
          </li>
        ))}
      </ul>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input type="checkbox" name="rules_read" value="1" required className="h-5 w-5 accent-[var(--accent)]" />
        <span>{w.confirm}</span>
      </label>
    </Card>
  );
}

export function SetTestForm({ account, w, tw, rules, weekElsewhere, isLive, children }: {
  account: string; w: W["tests"]; tw: Dict["door"]["verdict"]["test"]; rules: TestRule[];
  weekElsewhere: { account_id: string; title: string } | null; isLive: boolean; children?: ReactNode;
}) {
  const [state, formAction, pending] = useForm(setTestAction);
  const [pass, setPass] = useState(""); const [fail, setFail] = useState("");
  const [week, setWeek] = useState(isLive);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="account" value={account} />
      <Field label={w.setTitle}><Textarea name="what" required rows={2} maxLength={1000} /></Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={tw.deadline}><Input name="deadline" type="date" required /></Field>
        <Field label={tw.cost}><Input name="cost" type="number" inputMode="decimal" min={0} step="0.01" /></Field>
        <Field label={tw.pass}><Input name="pass_number" type="number" inputMode="numeric" step={1} required value={pass} onChange={(e) => setPass(e.target.value)} /></Field>
        <Field label={tw.fail}><Input name="fail_number" type="number" inputMode="numeric" step={1} required value={fail} onChange={(e) => setFail(e.target.value)} /></Field>
      </div>
      {children}
      {pass && fail ? <p className="text-xs text-muted">{fill(w.decided, { pass, fail })}</p> : null}
      {isLive ? (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" name="week" value="1" checked={week} onChange={(e) => setWeek(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
          <span>{w.makeWeek}</span>
        </label>
      ) : null}
      {week && weekElsewhere ? (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" name="force" value={weekElsewhere.account_id} className="h-5 w-5 accent-[var(--accent)]" />
          <span>{w.forceLabel} · {weekElsewhere.title}<span className="block text-xs text-muted">{w.weekTakenHint}</span></span>
        </label>
      ) : null}
      <RulesChecklist rules={rules} w={w.rules} />
      <Outcome state={state} />
      <Button type="submit" size="lg" disabled={pending}>{w.set}</Button>
    </form>
  );
}

export function MakeWeekForm({ account, w, weekElsewhere }: { account: string; w: W["tests"]; weekElsewhere: { account_id: string; title: string } | null }) {
  const [state, formAction, pending] = useForm(makeWeekTestAction);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="account" value={account} />
      {weekElsewhere ? (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" name="force" value={weekElsewhere.account_id} className="h-5 w-5 accent-[var(--accent)]" />
          <span>{w.forceLabel} · {weekElsewhere.title}</span>
        </label>
      ) : null}
      <Outcome state={state} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>{w.makeWeek}</Button>
    </form>
  );
}

export function ResultForm({ account, test, w, rescoreHref }: { account: string; test: TestRow; w: W["tests"]; rescoreHref: string }) {
  const [state, formAction, pending] = useForm(recordResultAction);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="account" value={account} />
      <input type="hidden" name="test" value={test.id} />
      <p className="text-[15px] font-semibold">{w.resultTitle}</p>
      <Field label={w.result}><Input name="result" type="number" inputMode="numeric" step={1} required /></Field>
      <Field label={w.changed}><Input name="changed" placeholder={w.changedPlaceholder} maxLength={600} /></Field>
      <p className="text-xs text-muted">{fill(w.decided, { pass: test.pass_number, fail: test.fail_number })}</p>
      <Outcome state={state} />
      {state?.prompt ? (
        <Notice tone={state.prompt === "pass" ? "success" : "warn"}>
          {w.prompt[state.prompt]}
          {state.prompt !== "pass" ? <span className="mt-2 block"><ButtonLink href={rescoreHref} variant="primary" size="sm">{w.prompt.rescoreButton}</ButtonLink></span> : null}
        </Notice>
      ) : null}
      {!state?.prompt ? <Button type="submit" disabled={pending}>{w.record}</Button> : null}
    </form>
  );
}

// ---------------------------------------------------------------- offer

const euro = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toFixed(2).replace(/\.00$/, ""));

export function OfferForm({ account, offer, w, savedLine }: { account: string; offer: OfferRow | null; w: W["offer"]; savedLine: string | null }) {
  const [state, formAction, pending] = useForm(saveOfferAction);
  const f = w.fields;
  const text = (name: keyof OfferRow & string, label: string, placeholder?: string) => (
    <Field key={name} label={label}><Textarea name={name} defaultValue={(offer?.[name] as string | null) ?? ""} placeholder={placeholder} rows={2} maxLength={2000} /></Field>
  );
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="account" value={account} />
      {text("customer", f.customer)}
      {text("problem", f.problem)}
      {text("promise", f.promise)}
      {text("deliverable", f.deliverable)}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={f.price}><Input name="price" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={euro(offer?.price_cents)} /></Field>
        <Field label={f.anchored_against}><Input name="anchored_against" defaultValue={offer?.anchored_against ?? ""} maxLength={400} /></Field>
      </div>
      {text("proof", f.proof)}
      {text("risk_reversal", f.risk_reversal)}
      <Field label={f.objections}>
        <Textarea name="objections" rows={4} maxLength={4000} defaultValue={(offer?.objections ?? []).map((o) => `${o.objection} — ${o.answer}`).join("\n")} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label={f.unit_cost}><Input name="unit_cost" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={euro(offer?.unit_cost_cents)} /></Field>
        <Field label={f.unit_margin}><Input name="unit_margin" type="number" inputMode="decimal" step="0.01" defaultValue={euro(offer?.unit_margin_cents)} /></Field>
        <Field label={f.cac}><Input name="cac" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={euro(offer?.cac_cents)} /></Field>
      </div>
      {text("wtp_instrument", f.wtp_instrument, f.wtp_instrumentPlaceholder)}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label={f.wtp_pass_number}><Input name="wtp_pass_number" type="number" inputMode="numeric" step={1} defaultValue={offer?.wtp_pass_number ?? ""} /></Field>
        <Field label={f.wtp_deadline}><Input name="wtp_deadline" type="date" defaultValue={offer?.wtp_deadline ?? ""} /></Field>
        <Field label={f.wtp_result}><Input name="wtp_result" type="number" inputMode="numeric" step={1} defaultValue={offer?.wtp_result ?? ""} /></Field>
      </div>
      {savedLine ? <p className="text-xs text-muted">{savedLine}</p> : null}
      <Outcome state={state} okText={savedLine ?? undefined} />
      <Button type="submit" size="lg" disabled={pending}>{w.save}</Button>
    </form>
  );
}

// ---------------------------------------------------------------- team

export function InviteForm({ account, w, full }: { account: string; w: W["team"]; full: boolean }) {
  const [state, formAction, pending] = useForm(inviteMemberAction);
  if (state?.link) {
    return (
      <Card tone="success" className="flex flex-col gap-2">
        <p className="text-[15px] font-semibold">{fill(w.linkTitle, { email: state.link.email })}</p>
        <code className="block select-all break-all rounded-lg bg-surface px-3 py-2 text-xs">{state.link.link}</code>
        <p className="text-sm text-muted">{w.linkHint}{state.link.newLogin ? ` ${w.newLogin}` : ""}</p>
      </Card>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="account" value={account} />
      <Field label={w.email}><Input name="email" type="email" inputMode="email" autoComplete="off" required disabled={full} /></Field>
      {full ? <p className="text-sm text-muted">{w.full}</p> : null}
      <Outcome state={state} />
      <Button type="submit" disabled={pending || full}>{w.invite}</Button>
    </form>
  );
}

export function RemoveMemberForm({ account, member, w }: { account: string; member: MemberRow; w: W["team"] }) {
  const [state, formAction, pending] = useForm(removeMemberAction);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="account" value={account} />
      <input type="hidden" name="user" value={member.user_id} />
      <Outcome state={state} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>{w.remove}</Button>
    </form>
  );
}
