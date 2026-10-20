import { setThemeAction } from "@core/actions/theme";
import type { Theme } from "@core/lib/theme";
import { cx } from "@core/components/ui";
import { getCoreDict } from "@core/i18n";

/**
 * One tap: Dark ↔ Bright. A plain form, so it works before hydration.
 * `inline` shows both choices side by side (a settings page).
 */
export async function ThemeToggle({ theme, back, className, inline = false }: { theme: Theme; back: string; className?: string; inline?: boolean }) {
  const next: Theme = theme === "dark" ? "light" : "dark";
  const t = (await getCoreDict()).controls;
  if (inline) {
    const choices: Array<{ value: Theme; icon: string; label: string }> = [
      { value: "dark", icon: "☾", label: t.dark },
      { value: "light", icon: "☀", label: t.bright },
    ];
    return (
      <form action={setThemeAction} className={cx("grid grid-cols-2 gap-2", className)}>
        <input type="hidden" name="back" value={back} />
        {choices.map((c) => (
          <button
            key={c.value}
            type="submit"
            name="theme"
            value={c.value}
            aria-pressed={c.value === theme}
            className={cx(
              "flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3.5 text-sm transition-colors hover:bg-surface-2",
              c.value === theme ? "border-accent bg-accent-soft font-medium" : "border-border",
            )}
          >
            <span aria-hidden className="text-base leading-none">{c.icon}</span>
            {c.label}
          </button>
        ))}
      </form>
    );
  }
  return (
    <form action={setThemeAction} className={className}>
      <input type="hidden" name="theme" value={next} />
      <input type="hidden" name="back" value={back} />
      <button
        type="submit"
        aria-label={theme === "dark" ? t.toBright : t.toDark}
        title={theme === "dark" ? t.bright : t.dark}
        className={cx("inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg")}
      >
        <span aria-hidden className="text-base leading-none">{theme === "dark" ? "☀" : "☾"}</span>
        <span className="hidden sm:inline">{theme === "dark" ? t.bright : t.dark}</span>
      </button>
    </form>
  );
}
