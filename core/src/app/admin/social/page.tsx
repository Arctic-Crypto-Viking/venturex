import Link from "next/link";
import { createClient } from "@core/lib/supabase/server";
import { Badge, Button, Card, Notice } from "@core/components/ui";
import { loadRules } from "@core/lib/social/plan";
import { saveRuleAction, setPublishingAction } from "./actions";

export const dynamic = "force-dynamic"; // per-user data, never prerendered

type Overview = {
  publishing: boolean;
  connections: Array<{ id: string; account_name: string; provider: string; handle: string | null; account_type: string | null; health: string; health_note: string | null; token_expires_at: string | null; last_checked_at: string | null; connected_at: string; disconnected_at: string | null; daily_cap: number; queued: number; published: number }>;
  failed: Array<{ id: string; account_name: string; handle: string | null; format: string; scheduled_for: string; status: string; held_reason: string | null; error: string | null; attempts: number; updated_at: string }>;
  templates: Array<{ id: string; key: string; name: string; family: string; platform: string; format: string; slots: string[]; version: number; is_active: boolean; used: number }>;
  counts: { queued: number; held: number; failed: number; published_7d: number };
  generated_at: string;
};
const dt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Admin → Social (docs/SOCIAL-MANAGER.md §4.1): every connection and its health,
 * posts that failed or wait with Meta's own words, the kill switch
 * feature_flags.social.publishing (off = the worker renders and holds; nothing
 * reaches Meta), and the system templates. English, like the rest of admin.
 */
export default async function AdminSocialPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_social_overview");
  if (error || !data) return <Notice tone="danger">Social overview unavailable: {error?.message ?? "no data"}</Notice>;
  const o = data as Overview;
  const rules = await loadRules(supabase);
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="text-[15px] font-semibold">Social</h2>
        <p className="mt-1 text-sm text-muted">Connections, failures with Meta&apos;s error, the publishing switch and the system templates. The worker runs every minute from pg_cron (SETUP-GUIDE Part 15).</p>
      </div>
      {typeof sp.error === "string" ? <Notice tone="danger">{sp.error}</Notice> : null}

      <Card tone={o.publishing ? "success" : "warn"} className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Publishing is {o.publishing ? "ON" : "OFF"} <span className="font-normal text-muted">(feature flag social.publishing)</span></p>
          <p className="text-xs text-muted">{o.publishing ? "Due posts are published to Instagram." : "Posts render and hold; nothing reaches Meta. Switch on for the exit test."}</p>
        </div>
        <form action={setPublishingAction}>
          <input type="hidden" name="enabled" value={o.publishing ? "0" : "1"} />
          <Button type="submit" size="sm" variant={o.publishing ? "danger" : "primary"}>{o.publishing ? "Switch off" : "Switch on"}</Button>
        </form>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["Queued", o.counts.queued], ["Waiting", o.counts.held], ["Failed", o.counts.failed], ["Published · 7d", o.counts.published_7d]] as const).map(([k, v]) => (
          <Card key={k}><p className="text-xs text-muted">{k}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p></Card>
        ))}
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Connections ({o.connections.length})</h3>
        {o.connections.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
          <ul className="divide-y divide-border">
            {o.connections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span>{c.handle ? `@${c.handle}` : c.id}</span>
                    <Badge tone={c.disconnected_at ? "neutral" : c.health === "ok" ? "success" : c.health === "expiring" ? "warn" : "danger"}>{c.disconnected_at ? "disconnected" : c.health}</Badge>
                    <span className="text-xs text-muted">{c.provider} · {c.account_type ?? "—"}</span>
                  </p>
                  <p className="text-xs text-muted">{c.account_name} · token ends {c.token_expires_at ? dt.format(new Date(c.token_expires_at)) : "—"} · checked {c.last_checked_at ? dt.format(new Date(c.last_checked_at)) : "never"} · cap {c.daily_cap}/day</p>
                  {c.health_note ? <p className="text-xs text-danger">{c.health_note}</p> : null}
                </div>
                <p className="text-xs text-muted">{c.queued} queued · {c.published} published</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Failed and waiting posts, last 30 days ({o.failed.length})</h3>
        {o.failed.length === 0 ? <p className="text-sm text-muted">None.</p> : (
          <ul className="divide-y divide-border">
            {o.failed.map((p) => (
              <li key={p.id} className="py-2.5 first:pt-0 last:pb-0">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={p.status === "failed" ? "danger" : "warn"}>{p.status}{p.held_reason ? ` · ${p.held_reason}` : ""}</Badge>
                  <span className="font-medium">{p.handle ? `@${p.handle}` : "—"}</span>
                  <span className="text-xs text-muted">{p.account_name} · {p.format} · due {dt.format(new Date(p.scheduled_for))} · {p.attempts} {p.attempts === 1 ? "attempt" : "attempts"}</span>
                </p>
                {p.error ? <p className="mt-1 text-xs text-danger">{p.error}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="mb-1 text-sm font-semibold">System templates ({o.templates.length})</h3>
        <p className="mb-3 text-xs text-muted">Layouts as data in <code>social_templates</code> (account_id null). Edit them with SQL; the plan rules below have a form. See <Link href="/admin/settings" className="underline underline-offset-4">Settings</Link> for the flag.</p>
        <ul className="divide-y divide-border">
          {o.templates.map((tpl) => (
            <li key={tpl.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0">
              <span><span className="font-medium">{tpl.name}</span> <span className="text-xs text-muted">{tpl.key} · {tpl.family} · {tpl.format} · v{tpl.version}{tpl.is_active ? "" : " · inactive"}</span></span>
              <span className="text-xs text-muted">slots: {tpl.slots.join(", ") || "—"} · used {tpl.used}×</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h3 id="rules" className="mb-1 text-sm font-semibold">Plan rules ({rules.length})</h3>
        <p className="mb-3 text-xs text-muted">Phase 2 (docs/SOCIAL-MANAGER.md §4.4): what a trigger makes. Each card: <code>offset</code> from the trigger&apos;s instant (<code>-12d</code>, <code>-6h</code>, <code>+1d</code>), template <code>family</code>, <code>format</code> (feed_4x5 · square · story_9x16), <code>snap</code> (slot · evening · none), <code>asks</code>. The highest active key per trigger kind is used. Writes are audited (<code>social_rule_set</code>).</p>
        {typeof sp.saved === "string" ? <Notice tone="success">Rule {sp.saved} saved.</Notice> : null}
        <ul className="flex flex-col gap-4">
          {[...rules, null].map((r) => (
            <li key={r?.key ?? "new"}>
              <form action={saveRuleAction} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="block text-xs"><span className="mb-1 block font-medium">Key</span><input name="key" defaultValue={r?.key ?? ""} readOnly={!!r} required pattern="[a-z0-9_.]{3,80}" className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm" placeholder="gig.confirmed.v2" /></label>
                  <label className="block text-xs"><span className="mb-1 block font-medium">Trigger kind</span><input name="trigger_kind" defaultValue={r?.trigger_kind ?? ""} required pattern="[a-z0-9_.]{3,80}" className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm" placeholder="gig.confirmed" /></label>
                  <label className="block text-xs"><span className="mb-1 block font-medium">Name</span><input name="name" defaultValue={r?.name ?? ""} maxLength={80} className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm" /></label>
                </div>
                <label className="block text-xs"><span className="mb-1 block font-medium">Cards (JSON)</span><textarea name="posts" defaultValue={r ? JSON.stringify(r.posts, null, 1) : '[\n {"offset": "-12d", "family": "announce", "format": "feed_4x5", "snap": "slot", "asks": []}\n]'} rows={r ? Math.min(12, r.posts.length * 2 + 2) : 4} className="w-full rounded-lg border border-border bg-surface p-2 font-mono text-xs" /></label>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="is_active" value="1" defaultChecked={r ? r.is_active : true} /> Active{r ? <span className="text-muted"> · v{r.version}</span> : null}</label>
                  <Button type="submit" size="sm" variant="secondary">{r ? "Save rule" : "Add rule"}</Button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-xs text-faint">generated {new Date(o.generated_at).toLocaleString("en-GB")}</p>
    </section>
  );
}
