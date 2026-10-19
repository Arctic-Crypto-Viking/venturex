import type { ProductBrand } from "@core/product";

/**
 * The product's name and addresses: the one place they are written down.
 * Platform core reads this through `product.brand` (src/product.tsx); product
 * pages import it directly. No other imports here, so client components can
 * use it too. Renaming the product = changing this file.
 *
 * Name rule (DECISIONS.md, 19 Oct 2026): the product is Venturex, everywhere,
 * at venturex.aintegration.org (HANDOFF §10 D1, decided by the founder). The
 * working name "New Venture" stays only where it is the literal name of a
 * record (the claude.ai project, the canvas, the 18 Oct handoff) and in
 * `docs/HANDOFF.md`, which is dated.
 */
export const brand: ProductBrand = {
  name: "Venturex",
  domain: "venturex.aintegration.org",
  appUrl: "https://venturex.aintegration.org",
  siteUrl: "https://venturex.aintegration.org",
  tagline: "Find out this week whether your idea deserves your next 30 days",
  description:
    "Run an idea through five kill gates and a score out of 25. The answer is GO, PARKED or KILLED, with the reason in writing and the one test that would change it.",
};

/**
 * Who runs the product: the data controller named on /privacy and the address
 * for questions, data requests and deletion. Not decided (HANDOFF §10 D2): the
 * page says so until the founder names the company. Nothing is sent to anyone
 * before that.
 */
export const company: { legalName: string; status?: string; address: string; supportEmail: string } = {
  legalName: "The company behind Venturex",
  status: "to be named before the first customer",
  address: "Norway",
  supportEmail: "contact@pasai.art",
};
