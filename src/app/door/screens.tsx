"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { Badge, Button, ButtonLink, Card, Choice, Field, Input, Notice, Textarea, cx } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import type { Dict } from "@/i18n/en";
import { DEMAND_EVIDENCE_FROM, DIMENSIONS, GO_MIN, MAX_TOTAL, PARKED_MIN, type Dimension, type Scores, type Verdict, type VerdictResult } from "@/lib/door";
import type { ActionState } from "./actions";

/**
 * The door's screens (HANDOFF §6, the sketch's boards 1–4): one question each,
 * a plain <form> posting to a server action, large tap targets, the action
 * button at the bottom. Copy comes from the dictionary the page hands down.
 */
type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;
type D = Dict["door"];

const actionBar = "sticky bottom-0 -mx-5 mt-auto flex flex-col gap-2 bg-bg/90 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur";

function ErrorLine({ state }: { state: ActionState }) {
  return state?.error ? <Notice tone="danger">{state.error}</Notice> : null;
}

export function IdeaChip({ label, title }: { label: string; title: string }) {
  return (
    <p className="mb-4 flex items-center gap-2 text-sm">
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className="truncate rounded-full border border-border bg-surface px-2.5 py-1">{title}</span>
    </p>
  );
}

// ---------------------------------------------------------------- 1 · intake

export function IntakeScreen({ n, label, placeholder, defaultValue, action, t, last, nextLabel }: {
  n: number; label: string; placeholder: string; defaultValue?: string; action: Action; t: D; last: boolean; nextLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const pushedBack = state?.error === t.intake.customerPushback;
  return (
    <form action={formAction} className="flex flex-1 flex-col gap-5">
      <input type="hidden" name="n" value={n} />
      {pushedBack ? <input type="hidden" name="confirmed" value="1" /> : null}
      <Field label={label}>
        <Textarea name="value" defaultValue={defaultValue ?? ""} placeholder={placeholder} required maxLength={600} autoFocus rows={3} />
      </Field>
      <ErrorLine state={state} />
      <div className={actionBar}>
        <Button type="submit" size="lg" disabled={pending}>{last ? t.intake.run : nextLabel}</Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- 2 · gates

export function GateScreen({ n, question, kills, defaultAnswer, defaultNote, action, t, ideaTitle, nextLabel }: {
  n: number; question: string; kills: string; defaultAnswer: boolean | null; defaultNote: string; action: Action; t: D; ideaTitle: string; nextLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [answer, setAnswer] = useState<"yes" | "no" | "">(defaultAnswer === true ? "yes" : defaultAnswer === false ? "no" : "");
  return (
    <form action={formAction} className="flex flex-1 flex-col gap-5">
      <input type="hidden" name="n" value={n} />
      <IdeaChip label={t.gates.ideaLabel} title={ideaTitle} />
      <Card>
        <p className="flex items-start gap-3">
          <span className="font-mono text-sm text-muted">{n}</span>
          <span className="text-[17px] font-medium leading-snug">{question}</span>
        </p>
        <p className="mt-3 font-mono text-[11px] text-muted">{kills}</p>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <Choice type="radio" name="answer" value="yes" checked={answer === "yes"} onChange={() => setAnswer("yes")} label={t.gates.yes} required />
        <Choice type="radio" name="answer" value="no" checked={answer === "no"} onChange={() => setAnswer("no")} label={t.gates.no} />
      </div>
      <Field label={t.gates.noteLabel}>
        <Input name="note" defaultValue={defaultNote} placeholder={t.gates.notePlaceholder} maxLength={600} />
      </Field>
      <ErrorLine state={state} />
      <div className={actionBar}>
        <Button type="submit" size="lg" disabled={pending || !answer} variant={answer === "no" ? "secondary" : "primary"}>
          {answer === "no" ? t.gates.no : nextLabel}
        </Button>
      </div>
    </form>
  );
}

export function GatesPassed({ t, href }: { t: D; href: string }) {
  return (
    <Card tone="success" className="flex flex-col gap-3">
      <p className="text-[16px] font-semibold">{t.gates.passed.title}</p>
      <p className="text-sm text-muted">{t.gates.passed.body}</p>
      <ButtonLink href={href}>{t.gates.passed.cta}</ButtonLink>
    </Card>
  );
}

// ---------------------------------------------------------------- 3 · score

export function ScoreScreen({ n, dim, words, defaultLevel, defaultEvidence, action, t, ideaTitle, soFar, nextLabel }: {
  n: number; dim: Dimension; words: D["score"]["dims"][Dimension]; defaultLevel?: number;
  defaultEvidence?: { claim?: string; source?: string; source_date?: string }; action: Action; t: D; ideaTitle: string;
  soFar: { total: number; count: number }; nextLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [level, setLevel] = useState<number>(defaultLevel ?? 0);
  const asksEvidence = dim === "demand" && level >= DEMAND_EVIDENCE_FROM;
  return (
    <form action={formAction} className="flex flex-1 flex-col gap-5">
      <input type="hidden" name="n" value={n} />
      <IdeaChip label={t.gates.ideaLabel} title={ideaTitle} />
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[17px] font-semibold">{words.name}</p>
        <p className="text-right font-mono text-[11px] text-muted">{words.scale}</p>
      </div>
      <div className="flex flex-col gap-2">
        {words.levels.map((text, i) => (
          <Choice key={i} type="radio" name="level" value={String(i + 1)} checked={level === i + 1} onChange={() => setLevel(i + 1)} label={`${i + 1}`} hint={text} required />
        ))}
      </div>
      {asksEvidence ? (
        <Card tone="accent" className="flex flex-col gap-3">
          <p className="text-[15px] font-semibold">{t.score.evidence.title}</p>
          <p className="text-sm text-muted">{t.score.evidence.hint}</p>
          <Field label={t.score.evidence.claim}>
            <Textarea name="claim" defaultValue={defaultEvidence?.claim ?? ""} placeholder={t.score.evidence.claimPlaceholder} maxLength={600} rows={2} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t.score.evidence.source}><Input name="source" defaultValue={defaultEvidence?.source ?? ""} placeholder={t.score.evidence.sourcePlaceholder} maxLength={200} /></Field>
            <Field label={t.score.evidence.date}><Input name="source_date" type="date" defaultValue={defaultEvidence?.source_date ?? ""} /></Field>
          </div>
          <p className="text-xs text-muted">{t.score.evidence.fact}</p>
        </Card>
      ) : null}
      <ErrorLine state={state} />
      <div className={actionBar}>
        <p className="flex items-baseline justify-between font-mono text-xs text-muted">
          <span>{t.score.totalLabel}</span>
          <span>{soFar.total}{level ? ` + ${level}` : ""} / {MAX_TOTAL}</span>
        </p>
        <Button type="submit" size="lg" disabled={pending || !level}>{n === DIMENSIONS.length ? t.score.getVerdict : nextLabel}</Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- 4 · verdict

export type VerdictView = {
  result: VerdictResult;
  title: string;
  gateNotes: string[];
  gateQuestions: string[];
  weakest: Dimension[];
  threshold: { nextThreshold: number | null; short: number; atTheBar: boolean };
  rescoreOf?: { title: string; killed: boolean };
  signedIn: boolean | null;
  defaults?: {
    test?: { what?: string; deadline?: string; pass_number?: number; fail_number?: number; cost_cents?: number };
    revival?: { trigger?: string; number?: number; deadline?: string };
    card?: Record<string, string | undefined>;
    fact_changed?: string;
  };
};

const TONE: Record<Verdict, "success" | "warn" | "danger"> = { go: "success", parked: "warn", killed: "danger" };

export function VerdictScreen({ v, action, t, verdictNames, startOverHref }: { v: VerdictView; action: Action; t: D; verdictNames: Dict["verdicts"]; startOverHref: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const r = v.result;
  const w = t.verdict;
  const lead = r.killed_at_gate ? fill(w.killedAtGate.lead, { n: r.killed_at_gate }) : w[r.verdict].lead;
  const body = r.killed_at_gate ? w.killedAtGate.body : w[r.verdict].body;
  const nextState = v.threshold.nextThreshold === GO_MIN ? verdictNames.go : v.threshold.nextThreshold === PARKED_MIN ? verdictNames.parked : "";

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-5">
      {v.rescoreOf ? <Notice tone="accent">{fill(w.rescoring, { title: v.rescoreOf.title })}</Notice> : null}
      <Card tone={TONE[r.verdict]} className="flex flex-col gap-2">
        <p className="flex items-center justify-between">
          <Badge tone={r.verdict === "go" ? "success" : r.verdict === "parked" ? "warn" : "danger"}>{verdictNames[r.verdict]}</Badge>
          {r.total !== null ? (
            <span className="font-display text-4xl font-semibold leading-none">{r.total}<span className="text-base font-normal text-muted"> {w.outOf}</span></span>
          ) : null}
        </p>
        <p className="text-[22px] font-semibold leading-tight">{lead}</p>
        <p className="text-sm text-muted">{body}</p>
        {r.total !== null && v.threshold.atTheBar && r.verdict === "go" ? <p className="text-sm font-medium">{w.atTheBar}</p> : null}
        {r.total !== null && v.threshold.nextThreshold !== null ? (
          <p className="text-sm">
            {fill(w.short, { n: v.threshold.short, t: v.threshold.nextThreshold })}{" "}
            {v.threshold.short === 1 ? fill(w.shortOne, { state: nextState }) : ""}
          </p>
        ) : null}
        {r.demand_capped ? <p className="text-sm">{w.capped}</p> : null}
      </Card>

      <h2 className="font-display text-[22px] font-semibold tracking-tight">{v.title}</h2>

      {r.scores ? <ScoreRows scores={r.scores} dims={t.score.dims} weakest={v.weakest} w={w} /> : (
        <Card>
          <p className="text-sm font-semibold">{w.gatesTitle}</p>
          <ol className="mt-2 flex flex-col gap-1.5 text-sm">
            {v.gateQuestions.slice(0, r.killed_at_gate ?? 5).map((q, i) => (
              <li key={i} className="flex gap-2">
                <Badge tone={i + 1 === r.killed_at_gate ? "danger" : "success"}>{i + 1 === r.killed_at_gate ? t.gates.no : t.gates.yes}</Badge>
                <span className="min-w-0">{q}{v.gateNotes[i] ? <span className="block text-muted">{v.gateNotes[i]}</span> : null}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {r.verdict === "go" ? <TestFields t={t} d={v.defaults?.test} /> : null}
      {r.verdict === "parked" ? <RevivalFields t={t} d={v.defaults?.revival} /> : null}
      {v.rescoreOf?.killed ? (
        <Card tone="warn" className="flex flex-col gap-2">
          <p className="text-[15px] font-semibold">{w.factChanged.title}</p>
          <p className="text-sm text-muted">{w.factChanged.hint}</p>
          <Field label={w.factChanged.label}><Textarea name="fact_changed" defaultValue={v.defaults?.fact_changed ?? ""} required maxLength={600} rows={2} /></Field>
        </Card>
      ) : null}
      <CardFields t={t} d={v.defaults?.card} />

      <ErrorLine state={state} />
      <div className={actionBar}>
        <Button type="submit" size="lg" disabled={pending}>{v.signedIn === false ? w.signInToSave : w.save}</Button>
        <p className="text-center text-xs text-muted">{w.saveHint}</p>
        <Link href={startOverHref} className="text-center text-sm text-muted underline-offset-4 hover:text-fg hover:underline">{w.again}</Link>
      </div>
    </form>
  );
}

function ScoreRows({ scores, dims, weakest, w }: { scores: Scores; dims: D["score"]["dims"]; weakest: Dimension[]; w: D["verdict"] }) {
  return (
    <Card className="flex flex-col gap-3">
      <p className="text-sm font-semibold">{w.scoresTitle}</p>
      <ul className="flex flex-col gap-2">
        {DIMENSIONS.map((d) => (
          <li key={d} className="flex items-center gap-3 text-sm">
            <span className="min-w-0 flex-1">{dims[d].name}</span>
            <span className="flex gap-1" aria-hidden>
              {[1, 2, 3, 4, 5].map((i) => <span key={i} className={cx("h-2.5 w-2.5 rounded-[3px]", i <= scores[d] ? "bg-fg" : "bg-border-strong")} />)}
            </span>
            <span className="w-4 text-right font-mono">{scores[d]}</span>
          </li>
        ))}
      </ul>
      <div className="border-t border-border pt-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-warn">{w.weak}</p>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {weakest.map((d) => (
            <li key={d}><span className="font-medium">{dims[d].name} ({scores[d]})</span> — {dims[d].levels[scores[d] - 1]}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">{w.yours}</p>
      </div>
    </Card>
  );
}

function TestFields({ t, d }: { t: D; d?: { what?: string; deadline?: string; pass_number?: number; fail_number?: number; cost_cents?: number } }) {
  const w = t.verdict.test;
  const [pass, setPass] = useState<string>(d?.pass_number?.toString() ?? "");
  const [fail, setFail] = useState<string>(d?.fail_number?.toString() ?? "");
  return (
    <Card tone="accent" className="flex flex-col gap-3">
      <p className="text-[15px] font-semibold">{w.title}</p>
      <p className="text-sm text-muted">{w.hint}</p>
      <Field label={w.what}><Textarea name="test_what" defaultValue={d?.what ?? ""} placeholder={w.whatPlaceholder} required maxLength={600} rows={2} /></Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={w.deadline}><Input name="test_deadline" type="date" defaultValue={d?.deadline ?? ""} required /></Field>
        <Field label={w.cost}><Input name="test_cost" type="number" inputMode="numeric" min={0} step={1} defaultValue={d?.cost_cents != null ? Math.round(d.cost_cents / 100) : ""} /></Field>
        <Field label={w.pass}><Input name="test_pass" type="number" inputMode="numeric" step={1} required value={pass} onChange={(e) => setPass(e.target.value)} /></Field>
        <Field label={w.fail}><Input name="test_fail" type="number" inputMode="numeric" step={1} required value={fail} onChange={(e) => setFail(e.target.value)} /></Field>
      </div>
      {pass && fail ? <p className="text-xs text-muted">{fill(w.decided, { pass, fail })}</p> : null}
    </Card>
  );
}

function RevivalFields({ t, d }: { t: D; d?: { trigger?: string; number?: number; deadline?: string } }) {
  const w = t.verdict.revival;
  return (
    <Card tone="warn" className="flex flex-col gap-3">
      <p className="text-[15px] font-semibold">{w.title}</p>
      <p className="text-sm text-muted">{w.hint}</p>
      <Field label={w.trigger}><Textarea name="revival_trigger" defaultValue={d?.trigger ?? ""} placeholder={w.triggerPlaceholder} required maxLength={600} rows={2} /></Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={w.number}><Input name="revival_number" type="number" inputMode="numeric" step={1} min={1} defaultValue={d?.number ?? ""} required /></Field>
        <Field label={w.deadline}><Input name="revival_deadline" type="date" defaultValue={d?.deadline ?? ""} required /></Field>
      </div>
    </Card>
  );
}

function CardFields({ t, d }: { t: D; d?: Record<string, string | undefined> }) {
  const w = t.verdict.card;
  const keys = ["assets", "channel_has", "channel_needs", "calendar", "unblocker"] as const;
  return (
    <details className="group rounded-2xl border border-border bg-surface px-4 py-3" open={Boolean(d && Object.values(d).some(Boolean))}>
      <summary className="cursor-pointer list-none text-[15px] font-medium">{w.title}</summary>
      <div className="mt-3 flex flex-col gap-3">
        {keys.map((k) => (
          <Field key={k} label={w[k]}><Input name={`card_${k}`} defaultValue={d?.[k] ?? ""} maxLength={600} /></Field>
        ))}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------- killed at a gate

export function KilledScreen({ n, question, why, note, t, recordHref, againAction }: {
  n: number; question: string; why: string; note: string; t: D; recordHref: string; againAction: () => Promise<void>;
}) {
  return (
    <div className="flex flex-1 flex-col gap-5">
      <Card tone="danger" className="flex flex-col gap-2">
        <Badge tone="danger">{fill(t.killed.title, { n })}</Badge>
        <p className="text-[17px] font-medium leading-snug">{question}</p>
        <p className="text-sm">{why}</p>
        {note ? <p className="text-sm text-muted"><span className="font-mono text-[11px] uppercase tracking-[0.08em]">{t.killed.yourLine}</span><br />{note}</p> : null}
      </Card>
      <p className="text-[15px] leading-relaxed text-muted">{t.killed.good}</p>
      <div className={actionBar}>
        <ButtonLink href={recordHref} size="lg">{t.killed.record}</ButtonLink>
        <form action={againAction}><Button type="submit" variant="ghost" className="w-full">{t.killed.again}</Button></form>
      </div>
    </div>
  );
}

export function SaveScreen({ t, action, hasRun, backHref }: { t: D; action: () => Promise<ActionState>; hasRun: boolean; backHref: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  if (!hasRun) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="warn">{t.save.nothing}</Notice>
        <ButtonLink href={backHref}>{t.save.backToDoor}</ButtonLink>
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-1 flex-col gap-4">
      <p className="text-[15px] leading-relaxed text-muted">{t.save.body}</p>
      <ErrorLine state={state} />
      <Button type="submit" size="lg" disabled={pending}>{pending ? t.save.saving : t.save.button}</Button>
    </form>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>;
}
