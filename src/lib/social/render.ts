import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import satori, { type Font } from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import type { BrandKit, FontKey } from "./db";
import { FORMAT_SIZE } from "./db";
import type { PostFormat } from "./types";

/**
 * Template → JPEG (docs/SOCIAL-MANAGER.md §4.7). A template is a Satori tree
 * (the engine behind @vercel/og) stored as data, with {{slot}} placeholders for
 * the post's values and {{brand.*}} for the brand kit. Satori draws it as SVG,
 * resvg rasterises, sharp writes a JPEG: quality 88, 1080 px wide, sRGB, which
 * satisfies every Instagram image rule in §3. The same render is the preview
 * the artist approves, so what they approve is what goes out.
 *
 * Fonts: the brand kit's font_key names one of the six families the looks ship.
 * Satori reads TTF/OTF/WOFF (not WOFF2), so the static @fontsource packages
 * (woff, 400 and 700) are read from node_modules at render time; next.config
 * traces them into the function (outputFileTracingIncludes).
 */
export const JPEG_QUALITY = 88;

const FONT_PKG: Record<FontKey, { pkg: string; family: string }> = {
  ibm_plex_sans: { pkg: "ibm-plex-sans", family: "IBM Plex Sans" },
  archivo: { pkg: "archivo", family: "Archivo" },
  dm_sans: { pkg: "dm-sans", family: "DM Sans" },
  fraunces: { pkg: "fraunces", family: "Fraunces" },
  source_sans_3: { pkg: "source-sans-3", family: "Source Sans 3" },
  manrope: { pkg: "manrope", family: "Manrope" },
};
export const FONT_FAMILY: Record<FontKey, string> = Object.fromEntries(Object.entries(FONT_PKG).map(([k, v]) => [k, v.family])) as Record<FontKey, string>;

const fontCache = new Map<string, Promise<Buffer>>();
function fontFile(pkg: string, weight: 400 | 700): Promise<Buffer> {
  const file = path.join(process.cwd(), "node_modules", "@fontsource", pkg, "files", `${pkg}-latin-${weight}-normal.woff`);
  let p = fontCache.get(file);
  if (!p) { p = readFile(file); fontCache.set(file, p); }
  return p;
}

async function fontsFor(key: FontKey): Promise<Font[]> {
  const f = FONT_PKG[key] ?? FONT_PKG.dm_sans;
  const [regular, bold] = await Promise.all([fontFile(f.pkg, 400), fontFile(f.pkg, 700)]);
  return [
    { name: f.family, data: regular, weight: 400, style: "normal" },
    { name: f.family, data: bold, weight: 700, style: "normal" },
  ];
}

// ------------------------------------------------------------------ images in the template

/** Fetch a picture and hand it to Satori as a data URI (no network from inside the layout engine). */
async function inlineImage(url: string, kind: "logo" | "photo"): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const out = kind === "logo"
      ? await sharp(buf).resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true }).png().toBuffer()
      : await sharp(buf).rotate().resize({ width: 1600, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    return `data:${kind === "logo" ? "image/png" : "image/jpeg"};base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}

/** The brand's accent, picked from the logo (founder decision 4): the dominant colour of the picture. */
export async function colourFromLogo(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const { dominant } = await sharp(Buffer.from(await res.arrayBuffer())).resize(64, 64, { fit: "inside" }).stats();
    const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ placeholders

type Node = { type: string; props?: { style?: Record<string, unknown>; children?: unknown; src?: string; [k: string]: unknown } };

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function fillString(s: string, vars: Record<string, string>): string {
  return s.replace(PLACEHOLDER, (_, k: string) => vars[k] ?? "");
}

/** Walks the tree: fills strings, drops an <img> whose source resolved to nothing and an empty text node. */
function fillTree(node: unknown, vars: Record<string, string>): unknown {
  if (typeof node === "string") return fillString(node, vars);
  if (Array.isArray(node)) return node.map((n) => fillTree(n, vars)).filter((n) => n !== null && n !== "");
  if (!node || typeof node !== "object") return node;
  const n = node as Node;
  const props = { ...(n.props ?? {}) };
  if (n.type === "img") {
    const src = typeof props.src === "string" ? fillString(props.src, vars) : "";
    if (!src) return null;
    props.src = src;
  }
  if (props.style) {
    props.style = Object.fromEntries(Object.entries(props.style).map(([k, v]) => [k, typeof v === "string" ? fillString(v, vars) : v]));
  }
  if ("children" in props) {
    const c = fillTree(props.children, vars);
    if (c === null || c === "" || (Array.isArray(c) && c.length === 0)) delete props.children; else props.children = c;
  }
  return { type: n.type, props };
}

export type RenderInput = {
  layout: unknown;
  format: PostFormat;
  /** The post's slot values ({{title}}, {{photo}} …). A `photo` slot is a URL and is inlined. */
  values: Record<string, string>;
  brand: Pick<BrandKit, "primary_color" | "secondary_color" | "font_key" | "logo_url" | "signature" | "handle" | "name">;
  /** Output width; 1080 for the post itself. */
  width?: number;
};

export async function renderTemplate(input: RenderInput): Promise<{ jpeg: Buffer; width: number; height: number }> {
  const size = FORMAT_SIZE[input.format];
  const width = input.width ?? size.width;
  const height = Math.round((size.height / size.width) * width);
  const fonts = await fontsFor(input.brand.font_key);
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.values)) vars[k] = v ?? "";
  if (vars.photo) vars.photo = (await inlineImage(vars.photo, "photo")) ?? "";
  vars["brand.primary"] = input.brand.primary_color;
  vars["brand.secondary"] = input.brand.secondary_color;
  vars["brand.font"] = FONT_FAMILY[input.brand.font_key] ?? FONT_FAMILY.dm_sans;
  vars["brand.signature"] = input.brand.signature ?? input.brand.name ?? "";
  vars["brand.handle"] = input.brand.handle ?? "";
  vars["brand.name"] = input.brand.name ?? "";
  vars["brand.logo"] = input.brand.logo_url ? (await inlineImage(input.brand.logo_url, "logo")) ?? "" : "";

  const tree = fillTree(input.layout, vars) as Parameters<typeof satori>[0];
  const svg = await satori(tree, { width: size.width, height: size.height, fonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
  const jpeg = await sharp(png).flatten({ background: input.brand.primary_color }).toColourspace("srgb").jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  return { jpeg, width, height };
}

/** A picture the artist uploaded, made into what Instagram takes: JPEG, sRGB, at most 1080 wide, cropped to the format. */
export async function normaliseUpload(buf: Buffer, format: PostFormat): Promise<{ jpeg: Buffer; width: number; height: number }> {
  const size = FORMAT_SIZE[format];
  const jpeg = await sharp(buf).rotate().resize({ width: size.width, height: size.height, fit: "cover", position: "attention" })
    .toColourspace("srgb").jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  return { jpeg, width: size.width, height: size.height };
}
