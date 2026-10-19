import Link from "next/link";
import type { ReactNode } from "react";
import { Mark } from "@/components/brand";
import { brand } from "@/brand";
import { cx } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import type { Dict } from "@/i18n/en";

/**
 * The frame of every door screen (the sketch's "Step n of 4" header): the mark
 * and name, the four-phase bar (Your idea · Kill gates · Score · Verdict), a
 * "line n of 5" label inside a phase, and a back link. Phone first; max-w-md.
 * Venture-neutral: nothing here names another venture.
 */
export function DoorFrame({
  phase, step, total, title, sub, backHref, children, t,
}: {
  /** 1 your idea · 2 gates · 3 score · 4 verdict */
  phase: 1 | 2 | 3 | 4;
  step?: number;
  total?: number;
  title: string;
  sub?: string;
  backHref?: string;
  children: ReactNode;
  t: Dict;
}) {
  const label = step && total ? fill(t.door.stepOf, { step, total }) : "";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
      <div className="flex h-9 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Mark size={24} />
          <span className="font-display text-[17px] font-semibold tracking-tight">{brand.name}</span>
        </Link>
        <span className="font-mono text-xs text-muted">
          {t.door.phases[phase - 1]}{label ? ` · ${label}` : ""}
        </span>
      </div>
      <ol className="mt-3 flex gap-1.5" aria-label={`${t.door.phases[phase - 1]}: ${phase} / 4`}>
        {t.door.phases.map((p, i) => (
          <li key={p} className={cx("h-1 flex-1 rounded-full", i + 1 <= phase ? "bg-accent" : "bg-border-strong")} />
        ))}
      </ol>
      <h1 className="mt-7 font-display text-[28px] font-semibold leading-[1.1] tracking-tight">{title}</h1>
      {sub ? <p className="mt-2 text-[15px] leading-relaxed text-muted">{sub}</p> : null}
      <div className="mt-6 flex flex-1 flex-col">{children}</div>
      {backHref ? (
        <p className="mt-6 text-center">
          <Link href={backHref} className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline">{t.common.back}</Link>
        </p>
      ) : null}
    </main>
  );
}
