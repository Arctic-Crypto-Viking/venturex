"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { setPlanFeatureAction, type MatrixState } from "./actions";

/**
 * One editable cell of the plan × feature matrix. Flags toggle and save at once;
 * numbers save on Enter or when the field loses focus with a changed value.
 */
export function MatrixCell({ plan, feature, kind, value }: { plan: string; feature: string; kind: string; value: unknown }) {
  const [state, formAction, pending] = useActionState(setPlanFeatureAction, undefined as MatrixState);
  const initial = kind === "flag" ? String(Boolean(value)) : typeof value === "number" ? String(value) : JSON.stringify(value ?? "");
  const [text, setText] = useState(initial);
  const formRef = useRef<HTMLFormElement>(null);
  const saved = useRef(initial);

  useEffect(() => { if (state?.ok) saved.current = text; }, [state, text]);

  if (kind === "flag") {
    const on = text === "true";
    return (
      <form action={formAction} ref={formRef} className="flex items-center justify-center">
        <input type="hidden" name="plan" value={plan} />
        <input type="hidden" name="feature" value={feature} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="value" value={on ? "false" : "true"} />
        <button
          type="submit"
          disabled={pending}
          aria-pressed={on}
          title={state?.error ?? (on ? "on — click to turn off" : "off — click to turn on")}
          className={`h-8 min-w-14 rounded-full px-3 text-xs font-medium transition-colors ${on ? "bg-success text-white" : "bg-surface-2 text-muted"} ${state?.error ? "ring-2 ring-danger" : ""}`}
          onClick={() => setText(on ? "false" : "true")}
        >
          {pending ? "…" : on ? "on" : "off"}
        </button>
      </form>
    );
  }

  return (
    <form action={formAction} ref={formRef}>
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="feature" value={feature} />
      <input type="hidden" name="kind" value={kind} />
      <input
        name="value"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (text !== saved.current) formRef.current?.requestSubmit(); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (text !== saved.current) formRef.current?.requestSubmit(); } }}
        title={state?.error ?? (text === "-1" ? "unlimited" : "")}
        disabled={pending}
        className={`h-9 w-full min-w-16 rounded-lg border bg-surface px-2 text-center text-sm tabular-nums outline-none focus:border-accent ${state?.error ? "border-danger" : state?.ok ? "border-success" : "border-border"}`}
      />
    </form>
  );
}
