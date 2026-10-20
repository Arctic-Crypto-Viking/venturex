import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button, ButtonLink, Card, Choice, Notice, Section } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import { FILES_PATH, loadFiles, ownSource, UUID } from "../../context";
import { FilesShell } from "../../shell";
import { listRemoteFolders, saveFoldersAction } from "../../actions";
import { FolderChooser } from "./chooser";

export const metadata = { title: "Folders" };

/**
 * Dropbox: which folders to follow. One level at a time (Open goes down, Up
 * comes back), ticks are kept across levels in the browser, Save writes the
 * list and asks for a sync. Everything under a ticked folder comes in.
 */
export default async function FoldersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const parent = typeof sp.parent === "string" && sp.parent.startsWith("/") ? sp.parent : null;
  if (!UUID.test(id)) notFound();
  const ctx = await loadFiles(`${FILES_PATH}/sources/${id}`);
  const src = ownSource(ctx, id);
  if (!src || src.provider !== "dropbox" || src.disconnected_at) redirect(`${FILES_PATH}/sources`);
  const t = ctx.dict.files.folders;
  const { folders, error } = await listRemoteFolders(src.id, parent);
  const up = parent ? (parent.lastIndexOf("/") > 0 ? parent.slice(0, parent.lastIndexOf("/")) : null) : null;

  return (
    <FilesShell ctx={ctx}>
      <Section title={fill(t.title, { label: src.label ?? "Dropbox" })}>
        <p className="-mt-1 text-sm text-muted">{t.intro}</p>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {parent ? <ButtonLink href={`${FILES_PATH}/sources/${src.id}${up ? `?parent=${encodeURIComponent(up)}` : ""}`} size="sm">{t.up}</ButtonLink> : null}
          <span className="text-muted">{parent ?? "/"}</span>
        </div>
        <FolderChooser sourceId={src.id} chosen={src.folders} folders={folders} parent={parent} t={t} action={saveFoldersAction} />
      </Section>
    </FilesShell>
  );
}

export { Link, Card, Choice, Button };
