import { Badge, Card, EmptyState, Notice } from "@core/components/ui";
import { UNLIMITED } from "@core/lib/entitlements";
import { fill } from "@core/lib/i18n-shared";
import { getDict } from "@/i18n";
import { fmtDate } from "@/lib/ventures";
import { loadMembers } from "@/lib/workspace";
import { loadWorkspace } from "../workspace";
import { InviteForm, RemoveMemberForm } from "../forms";
import { ScreenHead, WorkspaceOff } from "../off";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getDict()).workspace.team.metaTitle };
}

/**
 * Team (HANDOFF §6): who has access, invite one person (plan-gated by
 * venture.members_max), remove. Members' rows show the address they were
 * invited at; the users table shows nothing more (rule 6).
 */
export default async function TeamPage({ params }: PageProps<"/app/v/[id]/team">) {
  const { id } = await params;
  const { v, t, locale, on, supabase, user, isOwner, membersMax } = await loadWorkspace(id, `/app/v/${id}/team`);
  const w = t.workspace.team;
  if (!on) return <><ScreenHead v={v} t={t} title={w.title} /><WorkspaceOff t={t} id={id} /></>;
  const members = await loadMembers(supabase, id);
  const invited = members.filter((m) => m.role !== "owner");
  const full = membersMax !== UNLIMITED && invited.length >= membersMax;
  const limitLine = membersMax === UNLIMITED ? fill(w.limitUnlimited, { n: invited.length }) : fill(w.limit, { n: invited.length, max: membersMax });

  return (
    <div className="flex flex-col gap-6">
      <ScreenHead v={v} t={t} title={w.title} subtitle={w.sub} />
      <Card className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{limitLine}</p>
        {members.length === 0 ? <EmptyState title={w.empty} /> : (
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px]">{m.user_id === user.id ? w.you : (m.invited_email ?? m.user_id.slice(0, 8))}</span>
                  <span className="text-xs text-muted">{m.role === "owner" ? w.owner : w.member}{m.accepted_at ? ` · ${fmtDate(m.accepted_at, locale)}` : ""}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={m.status === "active" ? "success" : "warn"}>{m.status === "active" ? w.active : w.invited}</Badge>
                  {isOwner && m.role !== "owner" ? <RemoveMemberForm account={id} member={m} w={w} /> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {isOwner ? (
        <Card className="flex flex-col gap-3">
          <p className="text-[15px] font-semibold">{w.invite}</p>
          <InviteForm account={id} w={w} full={full} />
        </Card>
      ) : <Notice tone="accent">{w.notOwner}</Notice>}
    </div>
  );
}
