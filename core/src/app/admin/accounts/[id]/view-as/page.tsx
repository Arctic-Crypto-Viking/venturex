import { notFound, redirect } from "next/navigation";
import { createClient } from "@core/lib/supabase/server";
import { endViewAsAction } from "../../actions";
import { loadAccountDetail } from "../detail";
import { Button } from "@core/components/ui";
import { product } from "@product";

export const dynamic = "force-dynamic"; // per-user data, never prerendered

/**
 * "View as" (spec §6): the customer's home, rendered by the product from the
 * same component the customer sees (product.admin.ViewAs), fed by
 * admin_account_detail(). Read-only, and only inside an open impersonation
 * session that the audit log carries — core checks the session, the product
 * only draws.
 */
export default async function ViewAsPage({ params, searchParams }: PageProps<"/admin/accounts/[id]/view-as">) {
  const { id } = await params;
  const sp = await searchParams;
  const sessionId = typeof sp.session === "string" ? sp.session : null;
  const supabase = await createClient();
  const x = await loadAccountDetail(supabase, id);
  if (!x) notFound();
  const session = x.view_as_sessions.find((s) => s.id === sessionId && !s.ended_at);
  if (!session) redirect(`/admin/accounts/${id}?error=${encodeURIComponent("Start a view-as session first — every view is logged.")}`);

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm">
        <p>
          Viewing as <strong>{x.account.name}</strong> — read-only, session logged{session.reason ? ` (${session.reason})` : ""}.
        </p>
        <form action={endViewAsAction}>
          <input type="hidden" name="account" value={id} />
          <input type="hidden" name="session" value={session.id} />
          <Button type="submit" size="sm" variant="secondary">End view-as</Button>
        </form>
      </div>
      <product.admin.ViewAs detail={x} sessionId={session.id} searchParams={sp} />
    </section>
  );
}
