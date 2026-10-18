"use client";

import { useActionState } from "react";
import { Button, Card, Field, Input, Notice } from "@core/components/ui";
import { CopyButton } from "@core/components/copy-button";
import { inviteTesterAction, type InviteState } from "./actions";

/**
 * Admin → Accounts → Invite a tester (core). An e-mail goes in; a one-time sign-in
 * link comes out, with a Copy button. Nothing is sent: the founder sends the link,
 * together with the note below it (the product's `admin.testerNote`, and one line
 * about the link that is the same in every product).
 */
export function InviteBox({ note }: { note: string }) {
  const [state, formAction, pending] = useActionState(inviteTesterAction, undefined as InviteState);
  const local = state && "link" in state && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(state.site);
  return (
    <Card>
      <h3 id="invite" className="scroll-mt-24 text-sm font-semibold">Invite a tester</h3>
      <p className="mt-1 text-sm text-muted">
        Makes a one-time sign-in link for their e-mail address. Nothing is sent: you send the link yourself, in a chat or a mail.
      </p>
      <form action={formAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Field label="Their e-mail" htmlFor="invite-email">
            <Input
              id="invite-email" name="email" type="email" required maxLength={254} placeholder="name@example.com"
              autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            />
          </Field>
        </div>
        <Button type="submit" disabled={pending} className="sm:mb-0.5">{pending ? "Making the link…" : "Make the link"}</Button>
      </form>

      {state && "error" in state ? <div className="mt-3"><Notice tone="danger">{state.error}</Notice></div> : null}
      {state && "link" in state ? (
        <div className="mt-4 flex flex-col gap-3" aria-live="polite">
          <Notice tone="success">
            Link for <span className="font-medium wrap-anywhere">{state.email}</span>.{" "}
            {state.newLogin ? "A login was made for this address." : "This address already has a login; the link signs into it."}
          </Notice>
          <p className="rounded-xl border border-border bg-surface-2 px-3.5 py-3 font-mono text-sm break-all">{state.link}</p>
          <CopyButton text={state.link} label="Copy the link" size="md" />
          <p className="text-sm text-muted">
            It works once, for one hour from now (Supabase → Authentication → Sign In / Providers → Email → Email OTP
            Expiration, 3600 seconds unless you changed it). Once any link for this address is used, the others stop working. Opening it
            shows one button, Continue, and only that button signs in, so a chat preview cannot use it up. Send it to this
            person only: it signs in as them.
          </p>
          {local ? (
            <Notice tone="warn">This link points at {state.site}, so it only opens on this computer. Make it from the online admin to send it to someone.</Notice>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 border-t border-border pt-4">
        <h4 className="text-sm font-semibold">What to tell the tester</h4>
        <p className="mt-2 whitespace-pre-line text-sm">{note}</p>
        <div className="mt-3"><CopyButton text={note} label="Copy the note" size="md" /></div>
      </div>
    </Card>
  );
}
