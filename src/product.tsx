import type { ProductConfig } from "@core/product";
import { Mark } from "@/components/brand";
import { brand } from "@/brand";
import { AccountPanel } from "@/app/admin/_product/account-panel";
import { ViewAs } from "@/app/admin/_product/view-as";

/**
 * What platform core needs from New Venture (contract: core/src/product.ts).
 * Everything product-specific that core shows lives here or behind these imports.
 */
export const product: ProductConfig = {
  brand,
  Mark,
  homePath: "/app",
  privacyPath: "/privacy",
  signIn: { label: "Beta" },
  privatePrefixes: ["/app"],
  admin: {
    searchPlaceholder: "Name, e-mail or venture",
    accountTitle: (r) => (typeof r.venture_title === "string" && r.venture_title ? r.venture_title : null),
    overviewTiles: (o) => [
      ["Ventures live", Number(o.ventures_live ?? 0)],
      ["Ventures parked", Number(o.ventures_parked ?? 0)],
      ["Verdicts · 7d", Number(o.verdicts_7d ?? 0)],
      ["Tests due this week", Number(o.tests_due_7d ?? 0)],
    ],
    AccountPanel,
    ViewAs,
    // no Storage bucket yet: nothing is uploaded in v0
    storageBuckets: [],
    // sent with every invite link; core adds the line about the link itself
    testerNote: [
      "What is stored about you: your e-mail address and what you put in — your ideas, your answers at the door, your scores, tests, notes and decisions. It is kept in the EU (Frankfurt). I can open a read-only view of your account to help you; each look is logged.",
      "Nothing you write is shown to anyone else unless you switch a venture's forecast log to public yourself.",
      "Want it all deleted? Tell me, and I delete your account, your ventures and your login.",
    ].join("\n"),
  },
};
