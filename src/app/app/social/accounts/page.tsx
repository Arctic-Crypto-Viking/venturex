import Link from "next/link";
import { Badge, Button, ButtonLink, Card, Field, Input, Notice, Section, fieldRow } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import { featureValue, UNLIMITED } from "@core/lib/entitlements";
import { product } from "@product";
import { loadSocial, SOCIAL_PATH } from "../context";
import { SocialShell, label } from "../shell";
import { fmtDay } from "../format";
import { ConfirmForm } from "../confirm-form";
import { disconnectAction, saveCapAction } from "../actions";

export const metadata = { title: "Social accounts" };
const PATH = `${SOCIAL_PATH}/accounts`;

/**
 * Social accounts (§2.3 step 1): Connect Instagram → Meta's sheet → back here with
 * the handle and the account type. One card per connection with its health,
 * the posts-per-day cap and Disconnect. Every outcome of the OAuth round trip
 * arrives as ?connected / ?error=<word> and is said here in the person's language.
 */
export default async function SocialAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const ctx = await loadSocial(PATH);
  const t = ctx.dict.social;
  const a = t.accounts;
  const max = featureValue(ctx.ent, "social.accounts_max");
  const { count } = await ctx.supabase.from("social_connections").select("id", { count: "exact", head: true }).eq("account_id", ctx.account.id).is("disconnected_at", null);
  const atLimit = max !== UNLIMITED && (count ?? 0) >= max;
  const err = one("error");
  const errText = err ? (a.errors[err as keyof typeof a.errors] ?? a.errors.save) : null;
  const connectedId = one("connected");
  const justConnected = connectedId ? ctx.connections.find((c) => c.id === connectedId) : null;

  return (
    <SocialShell ctx={ctx}>
      <Section title={a.title}>
        <p className="-mt-1 text-sm text-muted">{fill(a.intro, { name: ctx.actor.name })}</p>
        {errText ? <Notice tone="danger">{fill(errText, { handle: one("handle") ? `@${one("handle")}` : "", n: max, accounts: max === 1 ? a.limitOne : a.limitMany })}{one("detail") ? <span className="block text-xs text-muted">{one("detail")}</span> : null}</Notice> : null}
        {justConnected ? <Notice tone="success">{fill(a.connected, { handle: label(justConnected) })}</Notice> : null}
        {one("disconnected") ? <Notice tone="success">{a.disconnected}</Notice> : null}
        {one("saved") ? <Notice tone="success">{a.saved}</Notice> : null}

        {ctx.connections.length === 0 ? <p className="text-sm text-muted">{a.none}</p> : null}
        <ul className="flex flex-col gap-3">
          {ctx.connections.map((c) => (
            <li key={c.id}>
              <Card className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-surface-2">
                    {c.avatar_url ? <img src={c.avatar_url} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[16px] font-semibold">{label(c)}</span>
                      <Badge tone={c.health === "ok" ? "success" : c.health === "expiring" ? "warn" : "danger"}>{t.health[c.health]}</Badge>
                    </p>
                    <p className="text-sm text-muted">
                      Instagram · {c.account_type ? (a.type[c.account_type as keyof typeof a.type] ?? c.account_type) : "—"}
                      {c.token_expires_at ? ` · ${fill(a.ends, { date: fmtDay(c.token_expires_at) })}` : ""}
                    </p>
                    {c.health_note && c.health !== "ok" ? <p className="mt-1 text-sm text-danger">{c.health_note}</p> : null}
                  </div>
                </div>
                {c.health !== "ok" ? (
                  <ButtonLink href={`/api/social/oauth/instagram/start?actor=${ctx.actor.id}&next=${encodeURIComponent(PATH)}`} variant="primary" prefetch={false}>{a.connectInstagram}</ButtonLink>
                ) : null}
                <form action={saveCapAction} className={fieldRow.pair}>
                  <input type="hidden" name="connection" value={c.id} />
                  <Field label={a.dailyCap} hint={a.dailyCapHint}><Input name="daily_cap" type="number" min={1} max={50} inputMode="numeric" defaultValue={c.daily_cap} /></Field>
                  <div className="flex items-end"><Button type="submit" variant="secondary">{a.save}</Button></div>
                </form>
                <ConfirmForm action={disconnectAction} message={fill(a.confirmDisconnect, { handle: label(c) })}>
                  <input type="hidden" name="connection" value={c.id} />
                  <Button type="submit" variant="ghost" size="sm" className="text-danger">{a.disconnect}</Button>
                </ConfirmForm>
              </Card>
            </li>
          ))}
        </ul>

        <Card tone="accent" className="flex flex-col gap-3">
          <p className="text-sm">{fill(a.connectHint, { app: product.brand.name })}</p>
          {atLimit ? (
            <p className="text-sm text-muted">{fill(a.limit, { n: max, accounts: max === 1 ? a.limitOne : a.limitMany })}</p>
          ) : (
            <ButtonLink href={`/api/social/oauth/instagram/start?actor=${ctx.actor.id}&next=${encodeURIComponent(PATH)}`} variant="primary" size="lg" prefetch={false}>{a.connectInstagram}</ButtonLink>
          )}
          {product.privacyPath ? <Link href={product.privacyPath} className="text-xs text-muted underline underline-offset-4">{ctx.dict.login.privacy}</Link> : null}
        </Card>
      </Section>
    </SocialShell>
  );
}
