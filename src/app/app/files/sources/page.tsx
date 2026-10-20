import { Badge, Button, ButtonLink, Card, Notice, Section } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import { featureValue, UNLIMITED } from "@core/lib/entitlements";
import { PROVIDER_LABEL, type Source } from "@core/lib/files/db";
import { fileProviderConfigured } from "@core/lib/files/providers";
import { ConfirmForm } from "@core/app/app/social/confirm-form";
import { LocalTime } from "@core/app/app/social/local-time";
import { FILES_PATH, loadFiles } from "../context";
import { FilesShell } from "../shell";
import { GooglePicker } from "../google-picker";
import { disconnectSourceAction, syncNowAction } from "../actions";

export const metadata = { title: "Sources" };

/**
 * Sources (docs/FILES.md §3): the account's uploads (always there), and the
 * clouds — Dropbox (choose folders, synced by cursor) and Google Drive (pick
 * files in Google's Picker). Health, last sync, what is followed, Sync now,
 * Disconnect. Connect buttons appear only for providers the server has keys for.
 */
export default async function SourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const ctx = await loadFiles(`${FILES_PATH}/sources`);
  const t = ctx.dict.files.sources;
  const live = ctx.sources.filter((s) => s.provider !== "upload" && !s.disconnected_at);
  const max = featureValue(ctx.ent, "files.sources_max");
  const atLimit = max !== UNLIMITED && live.length >= max;
  const { count: uploads } = await ctx.supabase.from("file_items").select("id", { count: "exact", head: true }).eq("account_id", ctx.account.id).neq("status", "missing");
  const error = one("error");
  const errorText = error ? (t.errors as Record<string, string>)[error] ?? t.errors.save : null;
  const connectedLabel = one("connected") ? ctx.sources.find((s) => s.id === one("connected"))?.label ?? "" : null;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "";
  const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? "";

  return (
    <FilesShell ctx={ctx}>
      <p className="-mt-2 text-sm text-muted">{t.intro}</p>
      {connectedLabel !== null ? <Notice tone="success">{fill(t.connected, { label: connectedLabel })}</Notice> : null}
      {one("disconnected") ? <Notice tone="success">{t.disconnected}</Notice> : null}
      {one("requested") ? <Notice tone="success">{t.syncRequested}</Notice> : null}
      {one("folders") ? <Notice tone="success">{ctx.dict.files.folders.saved}</Notice> : null}
      {errorText ? <Notice tone="danger">{errorText}{one("detail") ? <span className="block text-xs opacity-80">{one("detail")}</span> : null}</Notice> : null}

      <Card className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">{t.uploads}</span>
          <Badge tone="success">{t.health.ok}</Badge>
        </div>
        <p className="text-sm text-muted">{t.uploadsHint} {fill(t.items, { n: String(uploads ?? 0) })}</p>
      </Card>

      {live.map((s) => (
        <Card key={s.id} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">{PROVIDER_LABEL[s.provider]}</div>
              <div className="truncate text-sm text-muted">{t.connectedAs} {s.label}</div>
            </div>
            <Badge tone={s.health === "ok" ? "success" : s.health === "expiring" ? "warn" : "danger"}>{t.health[s.health]}</Badge>
          </div>
          <p className="text-sm text-muted">
            {s.syncing_at ? t.syncing : s.last_synced_at ? <>{t.lastSynced.replace(" {date}", "")} <LocalTime iso={s.last_synced_at} /></> : t.neverSynced}
            {s.provider === "dropbox" ? <> · {s.folders.length ? fill(t.foldersChosen, { n: String(s.folders.length) }) : t.noFolders}</> : null}
          </p>
          {s.folders.length ? <ul className="flex flex-wrap gap-1.5">{s.folders.map((f) => <li key={f.id} className="rounded-full border border-border px-2.5 py-1 text-xs">{f.path || f.name}</li>)}</ul> : null}
          {s.health_note ? <Notice tone="warn">{s.health_note}</Notice> : null}
          {s.last_error ? <p className="text-xs text-danger">{t.lastError} {s.last_error}</p> : null}
          <div className="flex flex-wrap gap-2">
            {s.provider === "dropbox" ? <ButtonLink href={`${FILES_PATH}/sources/${s.id}`} size="sm" variant="primary">{t.chooseFolders}</ButtonLink> : null}
            {s.provider === "google_drive" && apiKey && appId ? <GooglePicker sourceId={s.id} apiKey={apiKey} appId={appId} t={t} /> : null}
            {s.health === "reconnect" ? <ButtonLink href={`/api/files/oauth/${s.provider}/start?next=${encodeURIComponent(`${FILES_PATH}/sources`)}&actor=${ctx.actor.id}`} size="sm" variant="primary">{t.health.reconnect}</ButtonLink> : null}
            <form action={syncNowAction}><input type="hidden" name="source" value={s.id} /><Button type="submit" size="sm" variant="secondary">{t.syncNow}</Button></form>
            <ConfirmForm action={disconnectSourceAction} message={fill(t.confirmDisconnect, { label: s.label ?? PROVIDER_LABEL[s.provider] })}>
              <input type="hidden" name="source" value={s.id} />
              <Button type="submit" size="sm" variant="ghost">{t.disconnect}</Button>
            </ConfirmForm>
          </div>
        </Card>
      ))}

      <Section title={t.title}>
        {atLimit ? <Notice tone="accent">{fill(t.limit, { n: String(max), sources: max === 1 ? t.limitOne : t.limitMany })}</Notice> : null}
        <ConnectRow configured={fileProviderConfigured("dropbox")} disabled={atLimit} label={t.connectDropbox} hint={t.dropboxHint} href={`/api/files/oauth/dropbox/start?next=${encodeURIComponent(`${FILES_PATH}/sources`)}&actor=${ctx.actor.id}`} missing={fill(t.notConfigured, { provider: "Dropbox" })} />
        <ConnectRow configured={fileProviderConfigured("google_drive")} disabled={atLimit} label={t.connectGoogle} hint={t.googleHint} href={`/api/files/oauth/google_drive/start?next=${encodeURIComponent(`${FILES_PATH}/sources`)}&actor=${ctx.actor.id}`} missing={fill(t.notConfigured, { provider: "Google Drive" })} />
      </Section>
    </FilesShell>
  );
}

function ConnectRow({ configured, disabled, label, hint, href, missing }: { configured: boolean; disabled: boolean; label: string; hint: string; href: string; missing: string }) {
  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        <p className="text-sm text-muted">{configured ? hint : missing}</p>
      </div>
      {configured ? <a href={disabled ? undefined : href} aria-disabled={disabled} className={`inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-accent px-4 text-[15px] font-medium text-accent-fg ${disabled ? "pointer-events-none opacity-50" : "hover:bg-accent-hover"}`}>{label}</a> : null}
    </Card>
  );
}

export type { Source };
