"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@core/lib/supabase/client";
import { publicEnv } from "@core/lib/env";
import { safeNext } from "@core/lib/safe-next";
import { Button, Input, Notice } from "@core/components/ui";
import { around } from "@core/lib/i18n-shared";
import type { CoreDict } from "@core/i18n/en";

/**
 * Sign-in with one e-mail. The mail carries a link AND a 6-digit code:
 *  - the link (token_hash → /auth/confirm) works from any browser or device;
 *  - the code can be read on the phone and typed here.
 * Requires the Magic Link e-mail template to include {{ .Token }} and the
 * /auth/confirm link (see docs/SETUP-GUIDE.md Part 7b).
 */
export function LoginForm({
  mark, appName, signupPath, privacyPath, t,
}: { mark: ReactNode; appName: string; signupPath?: string; privacyPath?: string; t: CoreDict["login"] }) {
  const params = useSearchParams();
  const next = safeNext(params.get("next")); // a path on this site only — it ends in window.location.assign()
  const linkFailed = params.get("error") === "link";
  const creating = Boolean(signupPath && next.startsWith(signupPath));
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "verifying" | "error">("idle");
  const [message, setMessage] = useState("");
  const [sentBefore, sentAfter] = around(t.sentTo, "email");

  async function requestLink(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) throw error;
      setState("sent");
    } catch (err) {
      setState("error");
      const raw = err instanceof Error ? err.message : t.sendFailed;
      setMessage(
        /rate limit|too many|security purposes/i.test(raw)
          ? t.tooMany
          : /not authorized/i.test(raw)
            ? // Supabase's built-in mailer only delivers to the project's own team (SETUP-GUIDE Part 12, stage 1)
              t.notAuthorized
            : raw,
      );
    }
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setState("verifying");
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
      if (error) throw error;
      window.location.assign(next);
    } catch (err) {
      setState("sent");
      setMessage(err instanceof Error ? err.message : t.codeFailed);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-10">
      <div className="rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-7">
        {mark}
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{creating ? t.createAccount : t.signIn}</h1>
        <p className="mt-1.5 text-[15px] text-muted">
          {creating ? t.introCreate : t.introSignIn}
        </p>

        {linkFailed && state === "idle" ? (
          <div className="mt-4">
            <Notice tone="warn">
              {t.linkFailed}
            </Notice>
          </div>
        ) : null}

        {state === "sent" || state === "verifying" ? (
          <form onSubmit={verifyCode} className="mt-6 flex flex-col gap-3">
            <Notice tone="success">
              {sentBefore}<strong>{email}</strong>{sentAfter}
            </Notice>
            <label className="mt-1 text-sm font-medium" htmlFor="code">{t.codeLabel}</label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="text-center text-2xl tracking-[0.5em]"
              placeholder="······"
              autoFocus
            />
            <Button type="submit" size="lg" full disabled={state === "verifying" || code.length !== 6}>
              {state === "verifying" ? t.checking : t.signInWithCode}
            </Button>
            {message ? <p className="text-sm text-danger">{message}</p> : null}
            <button
              type="button"
              onClick={() => { setState("idle"); setCode(""); setMessage(""); }}
              className="py-2 text-sm text-muted underline-offset-4 hover:underline"
            >
              {t.otherEmail}
            </button>
          </form>
        ) : (
          <form onSubmit={requestLink} className="mt-6 flex flex-col gap-3">
            <label className="text-sm font-medium" htmlFor="email">{t.emailLabel}</label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
            />
            <Button type="submit" size="lg" full disabled={state === "sending"}>
              {state === "sending" ? t.sending : creating ? t.sendTheLink : t.sendALink}
            </Button>
            {state === "error" ? <p className="text-sm text-danger">{message}</p> : null}
          </form>
        )}
      </div>
      <p className="mt-5 text-center text-xs text-faint">
        {appName}
        {privacyPath ? (
          <>
            {" · "}
            <Link href={privacyPath} className="underline-offset-4 hover:text-fg hover:underline">{t.privacy}</Link>
          </>
        ) : null}
      </p>
    </main>
  );
}
