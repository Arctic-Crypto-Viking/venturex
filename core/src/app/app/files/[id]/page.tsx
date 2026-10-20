import { notFound } from "next/navigation";
import { Badge, Button, ButtonLink, Card, Field, Input, Notice, Rows, Section, Select, Textarea } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import { ITEM_COLUMNS, PROVIDER_LABEL, type Item } from "@core/lib/files/db";
import { signedUrls } from "@core/lib/files/storage";
import { ConfirmForm } from "@core/app/app/social/confirm-form";
import { LocalTime } from "@core/app/app/social/local-time";
import { FILES_PATH, loadFiles, ownSource, UUID } from "../context";
import { FilesShell } from "../shell";
import { deleteItemAction, saveItemAction, setItemStatusAction, useInPostAction } from "../actions";

export const metadata = { title: "File" };

/** One file: the picture, where it comes from, how often it was used, its tags and caption idea, and what to do with it. */
export default async function FilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  if (!UUID.test(id)) notFound();
  const ctx = await loadFiles(`${FILES_PATH}/${id}`);
  const t = ctx.dict.files.item;
  const { data } = await ctx.supabase.from("file_items").select(ITEM_COLUMNS).eq("id", id).eq("account_id", ctx.account.id).maybeSingle();
  const item = data as Item | null;
  if (!item) notFound();
  const source = ownSource(ctx, item.source_id);
  const { data: folder } = item.folder_id ? await ctx.supabase.from("file_folders").select("name, path").eq("id", item.folder_id).maybeSingle() : { data: null };
  const urls = await signedUrls(ctx.supabase, [item.thumb_path, source?.provider === "upload" ? item.external_id : null].filter((p): p is string => Boolean(p)));
  const thumb = item.thumb_path ? urls.get(item.thumb_path) ?? null : null;
  const original = source?.provider === "upload" ? urls.get(item.external_id) ?? null : null;
  const size = item.bytes ? `${(item.bytes / 1_048_576).toFixed(1)} MB` : "";

  return (
    <FilesShell ctx={ctx} kind={item.kind === "video" ? "video" : item.kind === "image" ? "image" : null}>
      {one("saved") ? <Notice tone="success">{t.saved}</Notice> : null}
      {one("error") ? <Notice tone="danger">{one("error")}</Notice> : null}
      {item.status === "missing" ? <Notice tone="warn">{t.missing}</Notice> : null}
      {item.status === "hidden" ? <Notice tone="accent">{t.hidden}</Notice> : null}
      <Card className="flex flex-col gap-4">
        <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl bg-surface-2">
          {thumb ? <img src={thumb} alt={item.name} className="h-auto w-full" /> : <div className="flex aspect-square items-center justify-center text-sm text-muted">{t.preparing}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="accent">{item.kind === "video" ? t.video : t.photo}</Badge>
          <span className="text-muted">{item.times_used > 0 ? fill(t.used, { n: String(item.times_used) }) : t.unused}</span>
        </div>
        <Rows rows={[
          [t.source, source ? `${PROVIDER_LABEL[source.provider]}${source.label ? ` · ${source.label}` : ""}` : "—"],
          [t.folder, folder?.path || folder?.name || "—"],
          ["", `${item.name}${size || item.width ? ` · ${[size, item.width && item.height ? `${item.width}×${item.height}` : null].filter(Boolean).join(" · ")}` : ""}`],
          ...(item.taken_at ? [[t.taken.replace(" {date}", ""), <LocalTime key="taken" iso={item.taken_at} mode="day" />] as [string, React.ReactNode]] : []),
          ...(item.last_used_at ? [[t.lastUsed.replace(" {date}", ""), <LocalTime key="used" iso={item.last_used_at} mode="day" />] as [string, React.ReactNode]] : []),
        ]} />
        {original ? <a href={original} download className="self-start text-sm underline underline-offset-4">{item.name}</a> : null}
      </Card>

      {item.status === "active" && item.kind !== "other" && ctx.connections.length > 0 ? (
        <Section title={t.useInPost}>
          <p className="-mt-1 text-sm text-muted">{t.useHint}</p>
          <form action={useInPostAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="item" value={item.id} />
            {ctx.connections.length === 1 ? <input type="hidden" name="connection" value={ctx.connections[0].id} /> : (
              <Field label={t.postTo}>
                <Select name="connection" defaultValue={ctx.connections[0].id}>{ctx.connections.map((c) => <option key={c.id} value={c.id}>{c.handle ? `@${c.handle}` : c.display_name ?? c.provider}</option>)}</Select>
              </Field>
            )}
            <Button type="submit" size="md">{t.useInPost}</Button>
          </form>
        </Section>
      ) : item.status === "active" && item.kind !== "other" ? <Notice tone="accent">{t.noConnection}</Notice> : null}

      <Section title={t.tags}>
        <form action={saveItemAction} className="flex flex-col gap-4">
          <input type="hidden" name="item" value={item.id} />
          <Field label={t.tags} hint={t.tagsHint}><Input name="tags" defaultValue={item.tags.join(", ")} maxLength={600} /></Field>
          <Field label={t.note} hint={t.noteHint}><Textarea name="note" defaultValue={item.note ?? ""} rows={2} maxLength={500} /></Field>
          <Button type="submit" variant="secondary" className="self-start">{t.save}</Button>
        </form>
      </Section>

      <div className="flex flex-wrap gap-2">
        <ButtonLink href={FILES_PATH} variant="ghost">{t.back}</ButtonLink>
        {item.status !== "missing" ? (
          <form action={setItemStatusAction}>
            <input type="hidden" name="item" value={item.id} />
            <input type="hidden" name="status" value={item.status === "hidden" ? "active" : "hidden"} />
            <Button type="submit" variant="secondary">{item.status === "hidden" ? t.show : t.hide}</Button>
          </form>
        ) : null}
        <ConfirmForm action={deleteItemAction} message={t.confirmDelete}>
          <input type="hidden" name="item" value={item.id} />
          <Button type="submit" variant="danger">{t.delete}</Button>
        </ConfirmForm>
      </div>
    </FilesShell>
  );
}
