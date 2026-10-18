import { createClient } from "@core/lib/supabase/server";
import { Badge, Button, Card, Notice, Textarea } from "@core/components/ui";
import { product } from "@product";
import { setFlagAction, setSettingAction } from "./actions";

export const dynamic = "force-dynamic"; // per-user data, never prerendered

type Setting = { key: string; value: unknown; description: string | null; updated_at: string };
type Flag = { key: string; enabled: boolean; description: string | null };

/**
 * System settings (JSON per key: signup trial, outreach rules, gig checklist
 * template, plans) and feature flags (kill switches). Every write is an audited
 * RPC that re-checks the superadmin in SQL.
 */
export default async function AdminSettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: settings, error }, { data: flags }] = await Promise.all([
    supabase.rpc("admin_list_settings"),
    supabase.from("feature_flags").select("key, enabled, description").order("key"),
  ]);
  const S = (settings ?? []) as Setting[];
  const rows = S;
  const err = typeof sp.error === "string" ? sp.error : null;
  const saved = typeof sp.saved === "string" ? sp.saved : null;

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="text-[15px] font-semibold">Settings</h2>
        <p className="mt-1 text-sm text-muted">JSON per key. An empty value deletes the key. Every change is audited with you as the actor.</p>
      </div>
      {err ? <Notice tone="danger">{err}</Notice> : null}
      {saved ? <Notice tone="success">Saved {saved}.</Notice> : null}
      {error ? <Notice tone="danger">{error.message}</Notice> : null}

      <Card>
        <h3 className="text-sm font-semibold">Product</h3>
        <p className="mt-1 text-xs text-muted">Name, addresses and pitch shown in every title, preview card, manifest, calendar feed and sign-in screen. Set in code (the product&apos;s brand config) and changed by a deploy, so every surface agrees.</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {([
            ["Name", product.brand.name],
            ["Tagline", product.brand.tagline],
            ["Domain", product.brand.domain],
            ["App", product.brand.appUrl],
            ["Site", product.brand.siteUrl],
            ["Description", product.brand.description],
          ] as const).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Feature flags</h3>
        <ul className="divide-y divide-border">
          {((flags ?? []) as Flag[]).map((f) => (
            <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">{f.key} <Badge tone={f.enabled ? "success" : "neutral"}>{f.enabled ? "on" : "off"}</Badge></p>
                {f.description ? <p className="text-xs text-muted">{f.description}</p> : null}
              </div>
              <form action={setFlagAction}>
                <input type="hidden" name="key" value={f.key} />
                <input type="hidden" name="enabled" value={f.enabled ? "0" : "1"} />
                <Button type="submit" size="sm" variant="secondary">{f.enabled ? "Switch off" : "Switch on"}</Button>
              </form>
            </li>
          ))}
        </ul>
      </Card>

      {rows.map((s) => (
        <Card key={s.key}>
          <form action={setSettingAction} className="flex flex-col gap-2">
            <input type="hidden" name="key" value={s.key} />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">{s.key}</h3>
              {s.updated_at ? <span className="text-xs text-faint">updated {new Date(s.updated_at).toLocaleString("en-GB")}</span> : <Badge tone="warn">not set</Badge>}
            </div>
            {s.description ? <p className="text-xs text-muted">{s.description}</p> : null}
            <Textarea name="value" defaultValue={s.value == null ? "" : JSON.stringify(s.value, null, 2)} rows={8} className="font-mono text-xs" spellCheck={false} />
            <div><Button type="submit" size="sm">Save</Button></div>
          </form>
        </Card>
      ))}
    </section>
  );
}
