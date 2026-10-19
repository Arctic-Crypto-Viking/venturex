/**
 * Country rules per test, v0: a static checklist shown before a test starts
 * (HANDOFF §4.4). The words live in src/i18n (workspace.tests.rules); this file
 * says which items apply to which market. Nothing here is legal advice — it is
 * the founder's own notes of 13 Oct 2026 (Forbrukertilsynet, Vipps reserve-and-
 * capture) and the EU basics before any pre-sale, as reminders.
 */
export type RuleScope = "all" | "no" | "regulated";
export type TestRule = { key: "euBasics" | "noCharge" | "regulated"; scope: RuleScope };

export const TEST_RULES: readonly TestRule[] = [
  { key: "noCharge", scope: "no" },        // Norway: a shop may not charge a consumer before dispatch
  { key: "regulated", scope: "regulated" }, // food, health, finance: a written rules check first
  { key: "euBasics", scope: "all" },        // AI disclosure, withdrawal rights, claims, VAT
];

/** True when the venture's market (free text on the card) reads as Norway. */
export function isNorway(market: string | null | undefined): boolean {
  return /\b(norway|norge|noreg|norwegian|norsk)\b|^no$/i.test((market ?? "").trim());
}

/** The rules to show for a market: Norway's first when it applies, the rest always (the person judges "regulated"). */
export function rulesFor(market: string | null | undefined): TestRule[] {
  const no = isNorway(market);
  return TEST_RULES.filter((r) => r.scope !== "no" || no);
}
