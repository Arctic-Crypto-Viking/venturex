"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@core/components/ui";
import type { Dict } from "@/i18n/en";

/**
 * The venture's sections (HANDOFF §6): the card and the six workspace screens,
 * as a scrolling row of tabs that fits a phone. The workspace tabs are shown
 * dimmed when the plan has no workspace; the pages say why, without a price.
 */
export const WORKSPACE_TABS = ["stages", "ledger", "decisions", "tests", "offer", "team"] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

export function WorkspaceNav({ id, words, on }: { id: string; words: Dict["workspace"]["nav"]; on: boolean }) {
  const path = usePathname();
  const base = `/app/v/${id}`;
  const items: Array<[string, string, boolean]> = [[base, words.card, true], ...WORKSPACE_TABS.map((k) => [`${base}/${k}`, words[k], on] as [string, string, boolean])];
  return (
    <nav aria-label="Venture" className="-mx-5 flex gap-1 overflow-x-auto px-5 text-sm [scrollbar-width:none]">
      {items.map(([href, label, enabled]) => {
        const current = href === base ? path === base : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cx(
              "h-10 shrink-0 whitespace-nowrap rounded-lg px-3 leading-10 transition-colors",
              current ? "bg-fg text-bg" : "text-muted hover:bg-surface-2 hover:text-fg",
              !enabled && !current && "opacity-50",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
