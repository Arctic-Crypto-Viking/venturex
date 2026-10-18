import { setThemeAction } from "@core/actions/theme";
import type { Theme } from "@core/lib/theme";
import { cx } from "@core/components/ui";
import { getCoreDict } from "@core/i18n";

/** One tap: Dark ↔ Bright. A plain form, so it works before hydration. */
export async function ThemeToggle({ theme, back, className }: { theme: Theme; back: string; className?: string }) {
  const next: Theme = theme === "dark" ? "light" : "dark";
  const t = (await getCoreDict()).controls;
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
