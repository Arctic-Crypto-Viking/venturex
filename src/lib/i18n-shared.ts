/** Browser-safe half of core/src/lib/i18n.ts: the languages and the placeholder helpers. */
export const LOCALES = ["en", "nb", "es", "de", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LANG_COOKIE = "ap_lang";

/** Each language in its own words, for the picker. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", nb: "Norsk", es: "Español", de: "Deutsch", fr: "Français" };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** "nb-NO,nb;q=0.9,en;q=0.8" → "nb". Norwegian arrives as no, nb or nn: all Bokmål here. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  const wanted = (header ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().toLowerCase().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.split("=")[1] ?? 1);
      return { base: tag.split("-")[0], q: Number.isFinite(q) ? q : 0 };
    })
    .filter((x) => x.base && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { base } of wanted) {
    const code = base === "no" || base === "nn" ? "nb" : base;
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}


/** "Sent to {email}" → ["Sent to ", "."] around one placeholder, for text with markup in the middle. */
export function around(text: string, key: string): [string, string] {
  const i = text.indexOf(`{${key}}`);
  return i < 0 ? [text, ""] : [text.slice(0, i), text.slice(i + key.length + 2)];
}

/** Fills {name} placeholders. */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
