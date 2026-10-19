import { loadWorkspace } from "./workspace";
import { WorkspaceNav } from "./workspace-nav";

export const dynamic = "force-dynamic"; // per-user data, never prerendered

/** The venture's shell: the section tabs above every screen under /app/v/[id]. */
export default async function VentureLayout({ children, params }: LayoutProps<"/app/v/[id]">) {
  const { id } = await params;
  const { t, on } = await loadWorkspace(id, `/app/v/${id}`);
  return (
    <div className="flex flex-col gap-5">
      <WorkspaceNav id={id} words={t.workspace.nav} on={on} />
      {children}
    </div>
  );
}
