import { getLocale, type Locale } from "@core/lib/i18n";
import { en, type Dict } from "./en";
import { nb } from "./nb";
import { es } from "./es";
import { de } from "./de";
import { fr } from "./fr";

export type { Dict };
const DICTS: Record<Locale, Dict> = { en, nb, es, de, fr };

/** The product's words in the person's language (server components). Pair with fill() for {app}. */
export async function getDict(): Promise<Dict> {
  return DICTS[await getLocale()];
}

export function dictFor(locale: Locale): Dict {
  return DICTS[locale];
}
