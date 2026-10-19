import { Badge, ButtonLink, EmptyState, Notice, PageHeader } from "@core/components/ui";
import type { Dict } from "@/i18n/en";
import type { VentureCard } from "@/lib/ventures";
import { STATE_TONE } from "../../home-view";

/** The head of every workspace screen: the venture's title, its state, the screen's own title. */
export function ScreenHead({ v, t, title, subtitle, action }: { v: VentureCard; t: Dict; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <PageHeader
      eyebrow={<span className="flex flex-wrap items-center gap-2"><span className="normal-case tracking-normal">{v.title}</span><Badge tone={STATE_TONE[v.state]}>{t.states[v.state]}</Badge>{v.has_hours ? <Badge tone="accent">{t.states.hasHours}</Badge> : null}</span>}
      title={title}
      subtitle={subtitle}
      action={action}
    />
  );
}

/** What a plan without the workspace sees: the reason, no price (rule 13), the way back. */
export function WorkspaceOff({ t, id }: { t: Dict; id: string }) {
  return <EmptyState title={t.workspace.off.title} hint={t.workspace.off.body} action={<ButtonLink href={`/app/v/${id}`} variant="secondary">{t.workspace.nav.card}</ButtonLink>} />;
}

export function NotLive({ t }: { t: Dict }) {
  return <Notice tone="accent">{t.workspace.notLive}</Notice>;
}
