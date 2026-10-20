import Link from "next/link";
import { Badge, ButtonLink, EmptyState, Notice, Section } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import { loadFolders, loadItems, type Item } from "@core/lib/files/db";
import { signedUrls } from "@core/lib/files/storage";
import { FILES_PATH, loadFiles, UUID } from "./context";
import { FilesShell } from "./shell";
import { Uploader } from "./uploader";

export const metadata = { title: "Library" };

/**
 * The Library (docs/FILES.md §2): a grid of what the actor can post from —
 * newest first, filtered by kind and folder in the URL, thumbnails through
 * signed URLs (nothing in the bucket is public). Upload sits at the top; the
 * clouds are under Sources. Tap a tile for the file's own page.
 */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const ctx = await loadFiles();
  const t = ctx.dict.files;
  const kind = one("kind") === "image" ? "image" : one("kind") === "video" ? "video" : null;
  const folderId = one("folder") && UUID.test(one("folder")!) ? one("folder") : null;
  const [items, folders] = await Promise.all([
    loadItems(ctx.supabase, ctx.account.id, { kind, folderId, actorId: ctx.actor.id, status: one("hidden") ? "hidden" : "active" }),
    loadFolders(ctx.supabase, ctx.account.id),
  ]);
  const thumbs = await signedUrls(ctx.supabase, items.map((i) => i.thumb_path).filter((p): p is string => Boolean(p)));
  const counts = new Map<string, number>();
  for (const i of items) if (i.folder_id) counts.set(i.folder_id, (counts.get(i.folder_id) ?? 0) + 1);
  const liveFolders = folders.filter((f) => counts.has(f.id) || f.id === folderId);
  const connectedClouds = ctx.sources.filter((s) => s.provider !== "upload" && !s.disconnected_at);

  return (
    <FilesShell ctx={ctx} kind={kind}>
      {one("deleted") ? <Notice tone="success">{t.item.deleted}</Notice> : null}
      {one("error") ? <Notice tone="danger">{one("error")}</Notice> : null}
      <Section title={t.upload.button} action={connectedClouds.length === 0 ? <ButtonLink href={`${FILES_PATH}/sources`} size="sm">{t.tabs.sources}</ButtonLink> : null}>
        <Uploader t={t.upload} />
      </Section>
      {liveFolders.length > 1 || folderId ? (
        <nav className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none]" aria-label={t.item.folder}>
          <FolderChip href={`${FILES_PATH}${kind ? `?kind=${kind}` : ""}`} on={!folderId}>{t.plan.allFolders}</FolderChip>
          {liveFolders.map((f) => (
            <FolderChip key={f.id} href={`${FILES_PATH}?${new URLSearchParams({ ...(kind ? { kind } : {}), folder: f.id }).toString()}`} on={folderId === f.id}>
              {f.name} <span className="opacity-60">{counts.get(f.id) ?? 0}</span>
            </FolderChip>
          ))}
        </nav>
      ) : null}
      {items.length === 0 ? (
        <EmptyState title={t.empty} hint={t.emptyHint} action={<ButtonLink href={`${FILES_PATH}/sources`} variant="primary">{t.tabs.sources}</ButtonLink>} />
      ) : (
        <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2">
          {items.map((i) => <Tile key={i.id} item={i} src={i.thumb_path ? thumbs.get(i.thumb_path) ?? null : null} t={t.item} />)}
        </ul>
      )}
      {items.length > 0 ? (
        <p className="text-xs text-muted">
          {fill(t.sources.items, { n: String(items.length) })} · <Link href={`${FILES_PATH}?hidden=1`} className="underline underline-offset-4">{t.item.hidden}</Link> · <Link href="/app/social/plan" className="font-medium text-fg underline underline-offset-4">{t.plan.tab}</Link>
        </p>
      ) : null}
    </FilesShell>
  );
}

function FolderChip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={on ? "page" : undefined}
      className={`h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm leading-[34px] transition-colors ${on ? "border-fg bg-fg text-bg" : "border-border bg-surface text-fg hover:border-border-strong"}`}>
      {children}
    </Link>
  );
}

function Tile({ item, src, t }: { item: Item; src: string | null; t: FilesContextDict }) {
  return (
    <li>
      <Link href={`${FILES_PATH}/${item.id}`} className="group relative block aspect-square overflow-hidden rounded-xl bg-surface-2">
        {src ? (
          <img src={src} alt={item.name} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
        ) : (
          <span className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] text-muted">{item.thumb_tries >= 3 ? item.name : t.preparing}</span>
        )}
        {item.kind === "video" ? <Badge tone="neutral" className="absolute left-1.5 top-1.5 bg-black/60 text-white">{t.video}</Badge> : null}
        {item.times_used > 0 ? <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white">{item.times_used}×</span> : null}
        {item.status === "hidden" ? <span className="absolute inset-0 bg-bg/60" aria-hidden /> : null}
      </Link>
    </li>
  );
}

type FilesContextDict = Awaited<ReturnType<typeof loadFiles>>["dict"]["files"]["item"];
