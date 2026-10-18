import { markDoor, markTile } from "./mark-shape";

/**
 * The product mark: a doorway with the door ajar (geometry in mark-shape.ts).
 * Drawn from the look's tokens so it follows any re-skin; globals.css picks the
 * colours per theme (`.ap-mark`). Used in the header, the sign-in card and the
 * app icons.
 */
export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={`ap-mark ${className}`.trim()}
      xmlns="http://www.w3.org/2000/svg"
      // Trusted constant geometry, shared with scripts/gen-icons.mjs.
      dangerouslySetInnerHTML={{ __html: markTile("var(--mark-tile)") + markDoor("var(--mark-light)") }}
    />
  );
}

/** The same mark with fixed colours, for icon files that cannot read CSS variables. */
export function markSvg(accent = "#2f5bd3", fg = "#ffffff", size = 512) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${markTile(accent)}${markDoor(fg)}</svg>`;
}
