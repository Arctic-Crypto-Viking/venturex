"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isTemplate, TEMPLATE_COOKIE, THEME_COOKIE, type Theme } from "@core/lib/theme";
import { safeNext } from "@core/lib/safe-next";
import { isLocale, LANG_COOKIE } from "@core/lib/i18n";

const YEAR = 60 * 60 * 24 * 365;

function safeBack(fd: FormData): string {
  return safeNext(String(fd.get("back") ?? ""), "/"); // a path on this site only
}

/** Dark / Bright switch: sets the cookie and returns to the page it was pressed on. */
export async function setThemeAction(fd: FormData): Promise<void> {
  const theme = String(fd.get("theme") ?? "") as Theme;
  if (theme === "dark" || theme === "light") {
    const store = await cookies();
    store.set(THEME_COOKIE, theme, { path: "/", sameSite: "lax", maxAge: YEAR });
  }
  redirect(safeBack(fd));
}

/** Look picker: sets the template cookie and returns to the page it was pressed on. */
export async function setTemplateAction(fd: FormData): Promise<void> {
  const template = fd.get("template");
  if (isTemplate(template)) {
    const store = await cookies();
    store.set(TEMPLATE_COOKIE, template, { path: "/", sameSite: "lax", maxAge: YEAR });
  }
  redirect(safeBack(fd));
}

/** Language picker: sets the language cookie and returns to the page it was pressed on. */
export async function setLanguageAction(fd: FormData): Promise<void> {
  const lang = fd.get("lang");
  if (isLocale(lang)) {
    const store = await cookies();
    store.set(LANG_COOKIE, lang, { path: "/", sameSite: "lax", maxAge: YEAR });
  }
  redirect(safeBack(fd));
}
