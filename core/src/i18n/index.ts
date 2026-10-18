import { getLocale, type Locale } from "@core/lib/i18n";
import { en, type CoreDict } from "./en";
import { nb } from "./nb";
import { es } from "./es";
import { de } from "./de";
import { fr } from "./fr";

export type { CoreDict };
const CORE: Record<Locale, CoreDict> = { en, nb, es, de, fr };

/** Core's words in the person's language (server components). */
export async function getCoreDict(): Promise<CoreDict> {
  return CORE[await getLocale()];
}

export function coreDictFor(locale: Locale): CoreDict {
  return CORE[locale];
}
