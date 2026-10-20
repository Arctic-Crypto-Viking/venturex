"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Choice } from "@core/components/ui";
import type { CoreDict } from "@core/i18n";
import type { ChosenFolder } from "@core/lib/files/db";
import type { RemoteFolder } from "@core/lib/files/types";

type Words = CoreDict["files"]["folders"];

/** Ticks survive drilling into subfolders: the chosen set lives in the URL-free state here and is posted whole. */
export function FolderChooser({ sourceId, chosen, folders, parent, t, action }: {
  sourceId: string; chosen: ChosenFolder[]; folders: RemoteFolder[]; parent: string | null; t: Words; action: (fd: FormData) => Promise<void>;
}) {
  const [picked, setPicked] = useState<Record<string, string>>(Object.fromEntries(chosen.map((f) => [f.id, f.path])));
  const toggle = (f: RemoteFolder) => setPicked((p) => { const n = { ...p }; if (n[f.externalId]) delete n[f.externalId]; else n[f.externalId] = f.path.replace(/^\//, ""); return n; });
  const base = `/app/files/sources/${sourceId}`;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="source" value={sourceId} />
      <input type="hidden" name="names" value={JSON.stringify(picked)} />
      {Object.keys(picked).map((id) => <input key={id} type="hidden" name="folder" value={id} />)}
      {folders.length === 0 ? <p className="text-sm text-muted">{t.none}</p> : null}
      <ul className="flex flex-col gap-2">
        {folders.map((f) => (
          <li key={f.externalId} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Choice type="checkbox" name="pick" value={f.externalId} checked={Boolean(picked[f.externalId])} onChange={() => toggle(f)} label={f.name} hint={picked[f.externalId] ? undefined : undefined} />
            </div>
            <Link href={`${base}?parent=${encodeURIComponent(f.externalId)}`} className="h-11 shrink-0 rounded-xl border border-border px-3 text-sm leading-[42px] hover:border-border-strong">{t.open}</Link>
          </li>
        ))}
      </ul>
      {Object.keys(picked).length ? (
        <ul className="flex flex-wrap gap-1.5">{Object.entries(picked).map(([id, path]) => <li key={id} className="rounded-full border border-accent bg-accent-soft px-2.5 py-1 text-xs">{path}</li>)}</ul>
      ) : null}
      <Button type="submit" className="self-start">{t.save}</Button>
      {parent ? null : null}
    </form>
  );
}
