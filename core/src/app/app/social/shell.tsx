import type { ReactNode } from "react";
import { Notice, PageHeader } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import type { Connection } from "@core/lib/social/db";
import { SocialTabs } from "./tabs";
import type { SocialContext } from "./context";
import { fmtDay } from "./format";
import { product } from "@product";

/**
 * The Social section's frame: title with the actor's name, the four tabs, and the
 * health banner (reconnect / expiring / no connection) every tab shows at the top.
 */
export function SocialShell({ ctx, children, paused }: { ctx: SocialContext; children: ReactNode; paused?: boolean }) {
  const t = ctx.dict.social;
  const tabs = [
    { href: "/app/social", label: t.tabs.queue, exact: true },
    { href: "/app/social/new", label: t.tabs.newPost },
    { href: "/app/social/accounts", label: t.tabs.accounts },
    { href: "/app/social/brand", label: t.tabs.brand },
    { href: "/app/social/plan", label: ctx.dict.files.plan.tab },
    ...(product.social?.triggers ? [{ href: "/app/social/promote", label: t.promote.tab }] : []),
  ];
  return (
    <main className="flex flex-col gap-6">
      <PageHeader eyebrow={ctx.actor.name} title={t.title} subtitle={fill(t.subtitle, { name: ctx.actor.name })} />
      <SocialTabs tabs={tabs} />
      <HealthBanner connections={ctx.connections} t={t} paused={paused} />
      {children}
    </main>
  );
}

function HealthBanner({ connections, t, paused }: { connections: Connection[]; t: SocialContext["dict"]["social"]; paused?: boolean }) {
  const reconnect = connections.find((c) => c.health === "reconnect");
  const expiring = connections.find((c) => c.health === "expiring");
  return (
    <>
      {paused ? <Notice tone="warn">{t.banner.paused}</Notice> : null}
      {reconnect ? <Notice tone="danger">{fill(t.banner.reconnect, { handle: label(reconnect) })}</Notice> : null}
      {!reconnect && expiring ? <Notice tone="warn">{fill(t.banner.expiring, { handle: label(expiring), date: expiring.token_expires_at ? fmtDay(expiring.token_expires_at) : "" })}</Notice> : null}
    </>
  );
}

export const label = (c: Connection) => (c.handle ? `@${c.handle}` : c.display_name ?? c.external_id);
