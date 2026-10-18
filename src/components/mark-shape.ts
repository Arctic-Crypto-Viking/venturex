/**
 * The product mark's geometry on a 64-unit grid: a doorway with the door ajar
 * and one idea on its way through — "the door every idea goes through". Plain
 * strings and no imports, so the React mark (brand.tsx) and the icon script
 * (scripts/gen-icons.mjs, run by Node directly) draw exactly the same shape.
 * Original, venture-neutral, drawn from the look's tokens.
 */

/** The rounded tile, inset 2 units so its edge never clips. */
export const markTile = (fill: string) =>
  `<rect x="2" y="2" width="60" height="60" rx="16" fill="${fill}"/>`;

/** The doorway: an arched frame, the leaf swung open to the right, and the idea entering. */
export const markDoor = (ink: string) =>
  `<path d="M19 52V25a13 13 0 0 1 26 0v27" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>` +
  `<path d="M32 52V27l13-5v30z" fill="${ink}" opacity="0.42"/>` +
  `<circle cx="27" cy="40" r="3.6" fill="${ink}"/>`;
