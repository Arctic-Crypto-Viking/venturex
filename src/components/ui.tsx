import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * The component set every screen is built from. Visual decisions live here
 * and in globals.css (tokens); pages only compose. Keep it small: a new
 * variant is a line here, never a one-off class string in a page.
 * Every interactive element is at least 44px tall on touch (phone first).
 */

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// ------------------------------------------------------------------ buttons

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

const variantCls: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover shadow-[0_1px_0_rgb(0_0_0/0.06)]",
  secondary: "bg-surface text-fg border border-border-strong hover:bg-surface-2",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  soft: "bg-accent-soft text-accent hover:bg-accent hover:text-accent-fg",
  danger: "bg-danger-soft text-danger hover:bg-danger hover:text-white",
};
const sizeCls: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-lg gap-1.5",
  md: "h-11 px-4 text-[15px] rounded-xl gap-2",
  lg: "h-13 px-5 text-base rounded-2xl gap-2",
};
const btnBase =
  "inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none select-none";

export function Button({
  variant = "primary", size = "md", full = false, className, ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; full?: boolean }) {
  return <button className={cx(btnBase, variantCls[variant], sizeCls[size], full && "w-full", className)} {...rest} />;
}

export function ButtonLink({
  variant = "secondary", size = "md", full = false, className, href, ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; full?: boolean }) {
  return <Link href={href} className={cx(btnBase, variantCls[variant], sizeCls[size], full && "w-full", className)} {...rest} />;
}

// ------------------------------------------------------------------ surfaces

export function Card({ className, children, tone = "default" }: { className?: string; children: ReactNode; tone?: "default" | "accent" | "warn" | "success" | "danger" }) {
  const toneCls = {
    default: "bg-surface border-border shadow-card",
    accent: "bg-accent-soft border-transparent",
    warn: "bg-warn-soft border-transparent",
    success: "bg-success-soft border-transparent",
    danger: "bg-danger-soft border-transparent",
  }[tone];
  return <div className={cx("rounded-2xl border p-4 sm:p-5", toneCls, className)}>{children}</div>;
}

export function Section({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("flex flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        {action ? <div className="text-sm text-muted">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** `icon`: a tile (the product's IconTile or any 44px element) shown left of the words, so every section has a face. */
export function PageHeader({ eyebrow, title, subtitle, action, icon }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3.5">
        {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
        <div className="min-w-0">
          {eyebrow ? <p className="text-xs font-medium uppercase tracking-[0.14em] text-faint">{eyebrow}</p> : null}
          <h1 className="mt-1 text-2xl font-semibold leading-tight text-fg sm:text-3xl">{title}</h1>
          {subtitle ? <div className="mt-1.5 text-[15px] text-muted">{subtitle}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

/** `art`: an illustration above the words (the product's EmptyArt, or anything small). */
export function EmptyState({ title, hint, action, art }: { title: string; hint?: string; action?: ReactNode; art?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-strong px-4 py-8 text-center">
      {art ? <div className="mb-4 flex justify-center">{art}</div> : null}
      <p className="text-[15px] font-medium text-fg">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "accent" | "success" | "warn" | "danger"; children: ReactNode; className?: string }) {
  const cls = {
    neutral: "bg-surface-2 text-muted",
    accent: "bg-accent-soft text-accent",
    success: "bg-success-soft text-success",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
  }[tone];
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium", cls, className)}>{children}</span>;
}

export function Notice({ tone = "warn", children }: { tone?: "warn" | "danger" | "success" | "accent"; children: ReactNode }) {
  const cls = {
    warn: "bg-warn-soft text-fg border-warn/30",
    danger: "bg-danger-soft text-danger border-danger/30",
    success: "bg-success-soft text-fg border-success/30",
    accent: "bg-accent-soft text-fg border-accent/30",
  }[tone];
  return <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-xl border px-3.5 py-3 text-sm leading-relaxed", cls)}>{children}</div>;
}

// ------------------------------------------------------------------ forms

export const inputCls =
  "w-full min-w-0 rounded-xl border border-border bg-surface px-4 text-fg placeholder:text-faint outline-none transition-colors focus:border-accent disabled:opacity-60 h-12 text-[16px]";
export const inputSmCls =
  "w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-fg placeholder:text-faint outline-none transition-colors focus:border-accent h-11 text-[16px] sm:h-10 sm:text-sm";

/**
 * Fields side by side: one per row on phones, the columns from sm: up. The
 * standard for every form row — never a bare grid-cols-2/3 around inputs, which
 * squeezes dates and selects out of their box at 375px. `pair` keeps a short
 * second field (currency, a button) beside the first at every width.
 */
export const fieldRow = {
  2: "grid grid-cols-1 gap-3 sm:grid-cols-2",
  3: "grid grid-cols-1 gap-3 sm:grid-cols-3",
  4: "grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:grid-cols-4",
  pair: "grid grid-cols-[minmax(0,1fr)_auto] gap-3",
} as const;

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cx(inputCls, className)} {...rest} />;
}
export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputCls, "h-auto min-h-28 py-3 leading-relaxed", className)} {...rest} />;
}
/** A dropdown. The arrow (`.ap-select`, core.css) is drawn in the text colour, so every look and theme shows it. */
export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={cx(inputCls, "ap-select appearance-none pr-10", className)} {...rest} />;
}

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block min-w-0">
      <span className="mb-1.5 block text-sm font-medium text-fg">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

/** A big tappable option (radio or checkbox) — the wizard's main control. */
export function Choice({
  type, name, value, checked, onChange, label, hint, required,
}: {
  type: "radio" | "checkbox"; name: string; value: string; checked: boolean; onChange: () => void;
  label: string; hint?: string; required?: boolean;
}) {
  return (
    <label
      className={cx(
        "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors",
        checked ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-border-strong",
      )}
    >
      <input type={type} name={name} value={value} checked={checked} onChange={onChange} required={required} className="sr-only" />
      <span
        aria-hidden
        className={cx(
          "flex h-6 w-6 shrink-0 items-center justify-center border text-[13px] font-bold transition-colors",
          type === "radio" ? "rounded-full" : "rounded-md",
          checked ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface",
        )}
      >
        {checked ? (type === "radio" ? "●" : "✓") : ""}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-medium leading-snug text-fg">{label}</span>
        {hint ? <span className="mt-0.5 block text-sm leading-snug text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

/** A toggle pill, e.g. genres. */
export function Chip({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      disabled={disabled}
      className={cx(
        "h-10 rounded-full border px-3.5 text-[15px] transition-colors",
        on ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface text-fg hover:border-border-strong",
        disabled && !on && "opacity-40",
      )}
    >
      {children}
    </button>
  );
}

export function ProgressDots({ step, total, label }: { step: number; total: number; label?: string }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label={label ?? `Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        return (
          <li
            key={n}
            className={cx(
              "h-1.5 rounded-full transition-all",
              n === step ? "w-7 bg-accent" : n < step ? "w-2.5 bg-accent/60" : "w-2.5 bg-border-strong",
            )}
          />
        );
      })}
    </ol>
  );
}

/** Small, muted definition rows (admin detail pages). */
export function Rows({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="truncate text-muted">{k}</dt>
          <dd className="min-w-0 break-words text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
