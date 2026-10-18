import { setLanguageAction } from "@core/actions/theme";
import { getLocale, LOCALE_NAMES, LOCALES } from "@core/lib/i18n";
import { getCoreDict } from "@core/i18n";
import { cx } from "@core/components/ui";

/**
 * Language picker, beside the Look and Dark/Bright switches: a <details> menu of
 * plain forms, so it works before hydration. Each language is named in its own
 * words; the choice is a cookie (core/src/lib/i18n.ts).
 */
export async function LanguagePicker({ back, className }: { back: string; className?: string }) {
  const [locale, t] = await Promise.all([getLocale(), getCoreDict()]);
  return (
    <details className={cx("group relative", className)}>
      <summary
        aria-label={t.controls.language}
        title={t.controls.language}
        className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden className="text-xs font-semibold uppercase tracking-wide">{locale === "nb" ? "no" : locale}</span>
        <span className="hidden sm:inline">{LOCALE_NAMES[locale]}</span>
      </summary>
      <form
        action={setLanguageAction}
        className="ap-picker-panel absolute right-0 top-full z-30 mt-2 grid w-44 gap-0.5 rounded-xl border border-border bg-surface p-1.5 text-fg shadow-pop"
      >
        <input type="hidden" name="back" value={back} />
        {LOCALES.map((l) => (
          <button
            key={l}
            type="submit"
            name="lang"
            value={l}
            lang={l}
            aria-pressed={l === locale}
            className={cx("flex min-h-11 items-center justify-between rounded-lg px-2.5 text-left text-sm transition-colors hover:bg-surface-2", l === locale && "bg-surface-2 font-medium")}
          >
            {LOCALE_NAMES[l]}
            {l === locale ? <span aria-hidden className="text-accent">✓</span> : null}
          </button>
        ))}
      </form>
    </details>
  );
}
