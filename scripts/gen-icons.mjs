// Regenerates the app icons from the mark in the default look's accent colour.
// Run after changing the mark or the default look:  node scripts/gen-icons.mjs
// Keep ACCENT in step with --accent of DEFAULT_TEMPLATE (Bright) in core/src/styles/core.css
// and the markSvg() default in src/components/brand.tsx. The shape itself comes from
// src/components/mark-shape.ts (Node strips its types, so it imports directly).
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { markDoor, markTile } from "../src/components/mark-shape.ts";

const ACCENT = "#2f5bd3"; // Nordic
const FG = "#ffffff";

const svg = (size, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${body}</svg>`;

// Same as markSvg() in src/components/brand.tsx: rounded tile + doorway.
const mark = (size) => svg(size, markTile(ACCENT) + markDoor(FG));

// Apple touch icon: full-bleed square, no transparency (iOS fills transparent corners with black and applies its own mask).
const apple = (size) => svg(size, `<rect width="64" height="64" fill="${ACCENT}"/>${markDoor(FG)}`);

// Maskable: full-bleed colour, the door scaled to 75% and centred in the safe zone (a circle of radius 40%).
const maskable = (size) =>
  svg(size, `<rect width="64" height="64" fill="${ACCENT}"/><g transform="translate(8 8) scale(0.75)">${markDoor(FG)}</g>`);

const png = (svg, out) => sharp(Buffer.from(svg)).png().toFile(out);

writeFileSync("src/app/icon.svg", mark(64));
await png(apple(180), "src/app/apple-icon.png");
await png(mark(192), "public/icons/icon-192.png");
await png(mark(512), "public/icons/icon-512.png");
await png(maskable(512), "public/icons/maskable-512.png");
console.log(`Icons written in ${ACCENT}`);
