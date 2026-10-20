"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@core/components/ui";

/** The section's tabs: a scrollable row of pills, the current one filled (phone first). */
export function SocialTabs({ tabs }: { tabs: Array<{ href: string; label: string; exact?: boolean }> }) {
  const path = usePathname();
  return (
    <nav className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none]" aria-label="Social">
      {tabs.map((tab) => {
        const on = tab.exact ? path === tab.href : path.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            className={cx(
              "h-10 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium leading-[38px] transition-colors",
              on ? "border-fg bg-fg text-bg" : "border-border bg-surface text-fg hover:border-border-strong",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
