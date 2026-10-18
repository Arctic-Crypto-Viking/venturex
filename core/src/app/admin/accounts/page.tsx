import Link from "next/link";
import { createClient } from "@core/lib/supabase/server";
import { Badge, Button, Notice, inputSmCls } from "@core/components/ui";
import { InviteBox } from "./invite-box";
import { product } from "@product";

export const dynamic = "force-dynamic"; // per-user data, never prerendered

/** The tester note when a product names none (product.admin.testerNote). */
const GENERIC_TESTER_NOTE =
  "What is stored about you: your e-mail address and what you enter.\nWant it all deleted? Tell me, and I delete your account and your login.";
/** The same in every product: how the link behaves, in a tester's words. */
const LINK_LINE =
  "The link works once, within an hour. Open it on the phone you will use; to sign in again later, ask me for a new link.";

type Row = {
  id: string; name: string; slug: string; access_status: string; is_internal: boolean; country: string | null;
  created_at: string; plan_key: string | null; plan_name: string | null; owner_email: string | null;
  paid_through: string | null; subscription_status: string | null; wizard_done: boolean;
} & Record<string, unknown>; // + the product's fields

/** Accounts list (spec §6 "Accounts": search, open). Reads through admin_list_accounts() as the superadmin. */
export default async function AdminAccountsPage({ searchParams }: PageProps<"/admin/accounts">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_accounts", { p_query: q || null, p_limit: 100 });
  const rows = (data ?? []) as Row[];
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const deleted = one("deleted") === "1"
    ? { files: one("files") ?? "0", login: one("login") ?? "—", filesError: one("files_error") }
    : null;
  const buckets = product.admin.storageBuckets ?? [];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Accounts</h2>
        <form className="flex w-full gap-2 sm:w-auto" action="/admin/accounts">
          <input name="q" defaultValue={q} placeholder={product.admin.searchPlaceholder ?? "Name or e-mail"} className={`${inputSmCls} min-w-0 flex-1 sm:w-64 sm:flex-none`} />
          <Button type="submit" size="sm" variant="secondary">Search</Button>
        </form>
      </div>
      {error ? <Notice tone="danger">{error.message}</Notice> : null}
      {deleted ? (
        // the outcome of Delete account (core/src/app/admin/accounts/actions.ts)
        <Notice tone={deleted.filesError || deleted.login.startsWith("kept") ? "warn" : "success"}>
          Account deleted. Files removed: {deleted.files}. Login: {deleted.login}.
          {deleted.filesError
            ? ` Files could not all be removed (${deleted.filesError}). Delete the account's folder in Storage${buckets.length ? ` (bucket ${buckets.join(", ")})` : ""}, then the user under Authentication.`
            : ""}
        </Notice>
      ) : null}
      <InviteBox note={`${product.admin.testerNote ?? GENERIC_TESTER_NOTE}\n${LINK_LINE}`} />
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/admin/accounts/${r.id}`} className="grid grid-cols-1 gap-1 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-[15px] font-medium">
                  <span className="truncate">{product.admin.accountTitle?.(r) || r.name}</span>
                  {r.is_internal ? <Badge>internal</Badge> : null}
                  {!r.wizard_done ? <Badge tone="warn">sign-up not finished</Badge> : null}
                </p>
                <p className="truncate text-xs text-muted">{r.owner_email ?? "—"} · {r.slug} · {r.country ?? "—"}</p>
              </div>
              <div className="text-xs text-muted sm:text-right">
                <p>
                  <span className="font-medium text-fg">{r.plan_name ?? r.plan_key ?? "—"}</span> · {r.access_status}
                  {r.paid_through ? ` · paid through ${date.format(new Date(r.paid_through))}` : ""}
                </p>
                <p>signed up {date.format(new Date(r.created_at))}</p>
              </div>
            </Link>
          </li>
        ))}
        {rows.length === 0 && !error ? <li className="px-4 py-8 text-center text-sm text-muted">No accounts match.</li> : null}
      </ul>
      <p className="text-xs text-faint">{rows.length} shown · newest first</p>
    </section>
  );
}
