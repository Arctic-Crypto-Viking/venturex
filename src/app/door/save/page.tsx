import { redirect } from "next/navigation";
import { getCurrentUser } from "@core/lib/auth";
import { getDict } from "@/i18n";
import { readDoor } from "@/lib/door-cookie";
import { DoorFrame } from "../frame";
import { SaveScreen } from "../screens";
import { saveAction } from "../actions";

export const dynamic = "force-dynamic";

/** After sign-in: one button saves the run from the cookie (a page cannot write cookies; the action does). */
export default async function SavePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/door/save");
  const [t, s] = await Promise.all([getDict(), readDoor()]);
  return (
    <DoorFrame phase={4} title={t.door.save.title} t={t}>
      <SaveScreen t={t.door} action={saveAction} hasRun={Boolean(s)} backHref="/door/start" />
    </DoorFrame>
  );
}
