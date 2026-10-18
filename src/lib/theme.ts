import { cookies } from "next/headers";

/**
 * Two explicit choices, made by the person and remembered per browser; nothing
 * follows the device setting (the founder asked for simple, explicit choices).
 *  - Theme: Dark / Bright. Dark is the default: the product is used at night,
 *    in clubs and on the way to them.
 *  - Look (template): palette, fonts, radii and header style from Atlas UI.
 *    Nordic is the default. Tokens live in core/src/styles/core.css.
 */
export type Theme = "dark" | "light";
export const THEME_COOKIE = "ap_theme";
export const DEFAULT_THEME: Theme = "dark";

export async function getTheme(): Promise<Theme> {
  const store = await cookies();
  const v = store.get(THEME_COOKIE)?.value;
  return v === "light" || v === "dark" ? v : DEFAULT_THEME;
}

export const TEMPLATES = [
  { id: "nordic", name: "Nordic", header: "Classic top bar", bg: { light: "#f5f7fa", dark: "#0e131b" } },
  { id: "ember", name: "Ember", header: "Bold band", bg: { light: "#22160f", dark: "#0d0907" } },
  { id: "lagoon", name: "Lagoon", header: "Floating pill", bg: { light: "#eff7f7", dark: "#0a191b" } },
  { id: "orchid", name: "Orchid", header: "Editorial masthead", bg: { light: "#fbf7fa", dark: "#160d15" } },
  { id: "forest", name: "Forest", header: "Sidebar on wide screens", bg: { light: "#1b3125", dark: "#0a0f0c" } },
] as const;
export type Template = (typeof TEMPLATES)[number]["id"];
export const TEMPLATE_COOKIE = "ap_template";
export const DEFAULT_TEMPLATE: Template = "nordic";

export function isTemplate(v: unknown): v is Template {
  return TEMPLATES.some((t) => t.id === v);
}

export async function getTemplate(): Promise<Template> {
  const store = await cookies();
  const v = store.get(TEMPLATE_COOKIE)?.value;
  return isTemplate(v) ? v : DEFAULT_TEMPLATE;
}

/** Browser chrome colour (status bar on phones): matches the top of the page, i.e. the header. */
export function themeColor(template: Template, theme: Theme): string {
  return TEMPLATES.find((t) => t.id === template)!.bg[theme];
}
