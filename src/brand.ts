import type { ProductBrand } from "@core/product";

/**
 * The product's name and addresses: the one place they are written down.
 * Platform core reads this through `product.brand` (src/product.tsx); product
 * pages import it directly. No other imports here, so client components can
 * use it too. Renaming the product = changing this file (HANDOFF §10 D1: the
 * working name stays until the founder decides; the subdomain of
 * aintegration.org is one DNS record when chosen, the Vercel address until then).
 */
export const brand: ProductBrand = {
  name: "New Venture",
  domain: "aintegration.org",
  appUrl: "https://newventure.aintegration.org",
  siteUrl: "https://newventure.aintegration.org",
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
  legalName: "The company behind New Venture",
  status: "to be named before the first customer",
  address: "Norway",
  supportEmail: "contact@pasai.art",
};
