import { featureValue, hasFeature, UNLIMITED, type Entitlements, type FeatureKey } from "@core/lib/entitlements";
import { fill } from "@core/lib/i18n-shared";
import { en, type Dict } from "@/i18n/en";

/**
 * What a customer may be told their plan includes.
 *
 * The plan matrix (reference data, migration 006) is ahead of the code: it
 * already carries values for the workspace, members, the weekly review, the
 * forecast log and AI verdicts. Anything a customer reads about their plan
 * names only the keys in LIVE_FEATURES. Add a key here in the same change
 * that ships the feature, never before (HANDOFF §5.4 says which step adds which).
 */
export const LIVE_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  "venture.ventures_max", // B2 (19 Oct 2026): the door saves ventures, the home page shows "n of m saved"
  "venture.workspace",    // B3 (19 Oct 2026): stages, ledger, decisions, tests, offer under /app/v/[id]
  "venture.members_max",  // B3 (19 Oct 2026): invite one person per venture (/app/v/[id]/team)
  // B5 adds "venture.weekly_review", "venture.forecast_public".
]);

export function isLiveFeature(key: FeatureKey): boolean {
  return LIVE_FEATURES.has(key);
}

export type PlanLine = { key: FeatureKey; label: string; on: boolean };

/** The plan in plain words, built features only, limits spelled out. */
export function planSummary(ent: Entitlements, w: Dict["plans"] = en.plans): PlanLine[] {
  const ventures = featureValue(ent, "venture.ventures_max");
  const members = featureValue(ent, "venture.members_max");
  const lines: PlanLine[] = [
    {
      key: "venture.ventures_max",
      label: ventures === UNLIMITED ? w.venturesUnlimited : fill(ventures === 1 ? w.ventureOne : w.ventureMany, { n: ventures }),
      on: ventures === UNLIMITED || ventures > 0,
    },
    { key: "venture.workspace", label: w.workspace, on: hasFeature(ent, "venture.workspace") },
    {
      key: "venture.members_max",
      label: fill(members === 1 ? w.membersOne : w.membersMany, { n: members }),
      on: members === UNLIMITED || members > 0,
    },
    { key: "venture.weekly_review", label: w.weeklyReview, on: hasFeature(ent, "venture.weekly_review") },
    { key: "venture.forecast_public", label: w.forecastPublic, on: hasFeature(ent, "venture.forecast_public") },
  ];
  return lines.filter((l) => isLiveFeature(l.key));
}
