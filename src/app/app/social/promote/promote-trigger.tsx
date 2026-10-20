import { ButtonLink, Button } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import { getCoreDict } from "@core/i18n";
import { createClient } from "@core/lib/supabase/server";
import { findTriggerPlan } from "@core/lib/social/plan";
import { promoteTriggerAction } from "./actions";
import { PROMOTE_PATH } from "../context";
import { product } from "@product";

/**
 * The vertical's button (§6 phase 2: "Promote this gig" on the gig's page): one
 * form that makes the plan and opens it, or a link to the plan that exists, with
 * its state (planned / scheduled / the gig moved). Renders nothing for a product
 * without triggers, or for a thing that is not a trigger right now (a gig that
 * is not confirmed). The product passes the trigger's kind and ref; everything
 * else is read here under the member's own client.
 */
export async function PromoteTrigger({ kind, refId, accountId }: { kind: string; refId: string; accountId: string }) {
  if (!product.social?.triggers) return null;
  const supabase = await createClient();
  const [dict, triggers, plan] = await Promise.all([getCoreDict(), product.social.triggers(supabase, accountId).catch(() => []), findTriggerPlan(supabase, accountId, kind, refId)]);
  const t = dict.social.promote;
  const trigger = triggers.find((x) => x.kind === kind && x.ref === refId);
  if (!trigger && !plan) return null;
  const state = !plan ? null : plan.moved_at ? t.moved : plan.status === "approved" ? t.scheduled : t.planned;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
      <p className="text-sm font-medium">{t.title}</p>
      <p className="text-sm text-muted">{state ?? fill(t.buttonHint, { app: product.brand.name })}</p>
      <div className="flex flex-wrap gap-2">
        {plan ? <ButtonLink href={`${PROMOTE_PATH}?plan=${plan.id}`} size="sm" variant={plan.status === "approved" ? "secondary" : "primary"}>{t.open}</ButtonLink> : null}
        {trigger && (!plan || plan.status === "proposed") ? (
          <form action={promoteTriggerAction}>
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="ref" value={refId} />
            <Button type="submit" size="sm" variant={plan ? "secondary" : "primary"}>{plan ? t.again : t.button}</Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
