import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@core/lib/supabase/server";
import { Badge, Button, Card, Field, Input, Notice, Rows, Select, inputSmCls } from "@core/components/ui";
import { deleteAccountAction, setEntitlementAction, startViewAsAction } from "../actions";
import { loadAccountDetail } from "./detail";
import { product } from "@product";

export const dynamic = "force-dynamic"; // per-user data, never prerendered

const dt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const d = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** One account (spec §6 "Accounts": open, view-as). Suspend / plan / payments arrive with the billing build. */
export default async function AdminAccountPage({ params, searchParams }: PageProps<"/admin/accounts/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [x, { data: features }] = await Promise.all([
    loadAccountDetail(supabase, id),
    supabase.from("features").select("key, name, kind").eq("is_active", true).order("key"),
  ]);
  if (!x) notFound();
  const F = (features ?? []) as Array<{ key: string; name: string; kind: string }>;
  const err = typeof sp.error === "string" ? sp.error : null;
  const deleteErr = typeof sp.delete_error === "string" ? sp.delete_error : null;
  const openSession = x.view_as_sessions.find((s) => !s.ended_at);
  const wizardDone = x.account.wizard_state && "completed_at" in x.account.wizard_state;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-faint">
            <Link href="/admin/accounts" className="hover:underline">Accounts</Link> / {x.account.slug}
          </p>
          <h2 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {x.account.name}
            {x.account.is_internal ? <Badge>internal</Badge> : null}
            {!wizardDone ? <Badge tone="warn">sign-up not finished</Badge> : null}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {x.plan?.name ?? "—"} · {x.account.access_status} · {x.entitled ? "entitled" : "not entitled"} · signed up {d.format(new Date(x.account.created_at))}
          </p>
        </div>
        <form action={startViewAsAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="account" value={x.account.id} />
          <input name="reason" placeholder="Reason (logged)" className={`${inputSmCls} w-48`} />
          <Button type="submit" size="sm">{openSession ? "View as (again)" : "View as"}</Button>
        </form>
      </div>
      {err ? <Notice tone="danger">{err}</Notice> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Owner & members</h3>
          <p className="text-sm">{x.owner?.email ?? "—"}{x.owner?.display_name ? ` · ${x.owner.display_name}` : ""}{x.owner?.is_superadmin ? " · superadmin" : ""}</p>
          <ul className="mt-2 text-sm text-muted">
            {x.members.map((m) => <li key={m.user_id}>{m.email ?? m.user_id} · {m.role} · {m.status}</li>)}
          </ul>
          <p className="mt-3 text-xs text-faint">{x.account.country ?? "—"} · {x.account.currency} · {x.account.locale}</p>
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-semibold">Subscription</h3>
          {x.subscription ? (
            <Rows rows={[
              ["Plan", `${x.subscription.plan_name} (${x.subscription.plan_key})`],
              ["Status", x.subscription.status],
              ["Term", `${x.subscription.term_months} months · ${x.subscription.provider}`],
              ["Paid through", `${x.subscription.paid_through ? d.format(new Date(x.subscription.paid_through)) : "—"} (+${x.subscription.grace_days}d grace)`],
            ]} />
          ) : <p className="text-sm text-muted">No subscription — free plan values apply.</p>}
          <p className="mt-3 text-xs text-faint">Record payment, change plan, suspend: arrive with the billing build (Week 5–6).</p>
        </Card>
      </div>

      {product.admin.AccountPanel ? <product.admin.AccountPanel detail={x} /> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Entitlements (resolved)</h3>
          <Rows rows={Object.entries(x.entitlements).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [
            k,
            typeof v === "boolean" ? (v ? "on" : "off") : v === -1 ? "unlimited" : JSON.stringify(v),
          ])} />
          {x.overrides.length ? (
            <>
              <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-faint">Overrides</p>
              <ul className="mt-1 text-sm">{x.overrides.map((o) => <li key={o.feature_key}>{o.feature_key} = {JSON.stringify(o.value)}{o.reason ? ` · ${o.reason}` : ""}{o.expires_at ? ` · until ${d.format(new Date(o.expires_at))}` : ""}</li>)}</ul>
            </>
          ) : null}
          {(x.usage ?? []).length ? (
            <>
              <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-faint">Usage</p>
              <Rows rows={x.usage.map((u) => [`${u.feature_key} · from ${d.format(new Date(u.period_start))}`, String(u.used)])} />
            </>
          ) : null}
          <form action={setEntitlementAction} className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
            <p className="text-xs text-muted">Grant an override for this account (empty value removes it). Audited.</p>
            <input type="hidden" name="account" value={x.account.id} />
            <div className="flex flex-wrap gap-2">
              <Select name="feature" className="h-9 min-w-48 text-sm" defaultValue={F[0]?.key}>
                {F.map((f) => <option key={f.key} value={f.key}>{f.key} ({f.kind})</option>)}
              </Select>
              <Select name="kind" className="h-9 text-sm" defaultValue="quota" aria-label="Value type">
                <option value="quota">number (−1 = unlimited)</option>
                <option value="flag">flag (true / false)</option>
              </Select>
              <input name="value" placeholder="value" className={`${inputSmCls} w-28`} />
              <input name="reason" placeholder="reason" className={`${inputSmCls} w-40`} />
              <Button type="submit" size="sm" variant="secondary">Save</Button>
            </div>
          </form>
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-semibold">View-as sessions & audit</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {x.view_as_sessions.map((s) => (
              <li key={s.id} className="flex justify-between gap-3">
                <span className="truncate">{s.admin_email ?? "—"}{s.reason ? ` · ${s.reason}` : ""}</span>
                <span className="shrink-0 text-muted">{dt.format(new Date(s.started_at))}{s.ended_at ? "" : " · open"}</span>
              </li>
            ))}
            {x.view_as_sessions.length === 0 ? <li className="text-muted">No view-as sessions.</li> : null}
          </ul>
          <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-faint">Last audit entries</p>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {x.audit.map((a) => (
              <li key={a.id} className="flex justify-between gap-3">
                <span className="truncate">{a.action} {a.entity_type} <span className="text-muted">· {a.actor_role ?? "—"}</span></span>
                <span className="shrink-0 text-muted">{dt.format(new Date(a.at))}</span>
              </li>
            ))}
            {x.audit.length === 0 ? <li className="text-muted">Nothing yet.</li> : null}
          </ul>
        </Card>
      </div>

      {x.account.admin_notes ? <Card><h3 className="mb-2 text-sm font-semibold">Notes</h3><p className="whitespace-pre-wrap text-sm">{x.account.admin_notes}</p></Card> : null}

      {/* Delete account (migration 020): the checks are repeated in SQL; this form only collects the typed name and the reason. */}
      <Card>
        <h3 id="delete" className="mb-2 scroll-mt-24 text-sm font-semibold text-danger">Delete account</h3>
        {/* a refusal is shown here, not at the top: on a phone #delete scrolls to this box */}
        {deleteErr ? <div className="mb-3"><Notice tone="danger">{deleteErr}</Notice></div> : null}
        {x.account.is_internal || x.owner?.is_superadmin ? (
          <p className="text-sm text-muted">
            {x.account.is_internal ? "This is the internal account." : "This account belongs to a founder login."} It cannot be deleted here.
          </p>
        ) : (
          <>
            <p className="text-sm">
              Removes the account and everything in it, its files, and the owner&apos;s login unless they own or belong to another account.
              This cannot be undone.
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm text-muted">
              <li>Anything they sent in that you published stays, without their name.</li>
              <li>The audit log keeps one entry with your reason. It holds no name and no e-mail address.</li>
              <li>An account with a payment or an invoice is refused, because those records have to be kept.</li>
            </ul>
            <form action={deleteAccountAction} className="mt-4 flex max-w-md flex-col gap-3 wrap-anywhere">
              <input type="hidden" name="account" value={x.account.id} />
              <Field label={`Type ${x.account.slug} to confirm`} htmlFor="delete-confirm">
                <Input id="delete-confirm" name="confirm" required autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              </Field>
              <Field label="Reason" hint="Kept in the audit log. Write it without names." htmlFor="delete-reason">
                <Input id="delete-reason" name="reason" required minLength={3} maxLength={200} placeholder="Tester asked for deletion" />
              </Field>
              <Button type="submit" variant="danger" full>Delete this account</Button>
            </form>
          </>
        )}
      </Card>
    </section>
  );
}
