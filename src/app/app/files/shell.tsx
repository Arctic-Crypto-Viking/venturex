import type { ReactNode } from "react";
import { PageHeader } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import { SocialTabs } from "@core/app/app/social/tabs";
import type { FilesContext } from "./context";

/** The Library's frame: title with the actor's name, and the tabs (All · Photos · Videos · Sources). */
export function FilesShell({ ctx, children, kind }: { ctx: FilesContext; children: ReactNode; kind?: "image" | "video" | null }) {
  const t = ctx.dict.files;
  const tabs = [
    { href: "/app/files", label: t.tabs.all, exact: true },
    { href: "/app/files?kind=image", label: t.tabs.photos, exact: true },
    { href: "/app/files?kind=video", label: t.tabs.videos, exact: true },
    { href: "/app/files/sources", label: t.tabs.sources },
  ];
  return (
    <main className="flex flex-col gap-6">
      <PageHeader eyebrow={ctx.actor.name} title={t.title} subtitle={fill(t.subtitle, { name: ctx.actor.name })} />
      <SocialTabs tabs={tabs.map((tb) => ({ ...tb, exact: tb.exact && !(kind && tb.href.endsWith(kind)) }))} />
      {children}
    </main>
  );
}
