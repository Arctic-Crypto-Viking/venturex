"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@core/components/ui";

/** Core tabs; the product's own tabs (product.admin.nav) go after Accounts. */
export function AdminNav({ extra }: { extra: Array<[string, string]> }) {
  const path = usePathname();
  const items: Array<[string, string]> = [
    ["/admin", "Overview"],
    ["/admin/accounts", "Accounts"],
    ...extra,
    ["/admin/feedback", "Feedback"],
    ["/admin/social", "Social"],
    ["/admin/plans", "Plans & features"],
    ["/admin/settings", "Settings"],
  ];
  return (
    <nav className="-mx-5 flex gap-1 overflow-x-auto px-5 text-sm [scrollbar-width:none]">
      {items.map(([href, label]) => {
        const on = href === "/admin" ? path === "/admin" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={cx(
              "h-9 whitespace-nowrap rounded-lg px-3 leading-9 transition-colors",
              on ? "bg-fg text-bg" : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
