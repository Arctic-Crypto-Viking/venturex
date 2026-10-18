import { cookies, headers } from "next/headers";
import { isLocale, LANG_COOKIE, localeFromAcceptLanguage, type Locale } from "./i18n-shared";

export * from "./i18n-shared";
/**
 * Languages. The person's choice is a cookie, like the look and theme
 * (core/src/lib/theme.ts); until they choose, the browser's Accept-Language
 * picks the first language we have (founder decision 16 Oct 2026: follow the
 * browser once, then the choice wins). No language in the URL: per-language
 * addresses can come later if search traffic in other languages matters.
 */
export async function getLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return localeFromAcceptLanguage((await headers()).get("accept-language"));
}
