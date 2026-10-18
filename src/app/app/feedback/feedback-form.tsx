"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, Choice, Notice, Textarea } from "@core/components/ui";
import { draftFeedbackAction, type DraftState } from "./actions";

const KINDS = [
  ["idea", "An idea", "Something new, or something done differently"],
  ["problem", "A problem", "Something broken, confusing or in the way"],
  ["other", "Something else", ""],
] as const;

/** Step 1: one box and one choice. The server tidies it up and looks for the same suggestion on the board. */
export function FeedbackForm({ draftsLeft, ai, privacyPath }: { draftsLeft: number; ai: boolean; privacyPath?: string }) {
  const [state, formAction, pending] = useActionState(draftFeedbackAction, undefined as DraftState);
  const [kind, setKind] = useState<string>("idea");
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label htmlFor="feedback-text" className="block">
        <span className="mb-1.5 block text-sm font-medium text-fg">What&apos;s on your mind?</span>
        <Textarea
          id="feedback-text" name="text" required minLength={10} maxLength={4000} rows={5}
          placeholder="What would you like, or what got in your way? Any language is fine."
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium text-fg">It is…</legend>
        {KINDS.map(([value, label, hint]) => (
          <Choice key={value} type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} label={label} hint={hint || undefined} />
        ))}
      </fieldset>
      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Button type="submit" size="lg" full disabled={pending || draftsLeft === 0}>
        {pending ? "Tidying it up and checking the board…" : "Continue"}
      </Button>
      <p className="text-xs text-muted">
        Next you see it the way others will: a short title and summary in English, with no names or contact details. Nothing is posted until you say so.
        {ai ? <> To tidy it up, your text goes to Anthropic&apos;s AI model Claude (USA).</> : null}
        {privacyPath ? <> <Link href={privacyPath} className="underline underline-offset-4">Privacy</Link></> : null}
      </p>
    </form>
  );
}
