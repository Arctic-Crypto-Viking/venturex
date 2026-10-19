import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** "New idea": the same door, saved straight into a new venture when the verdict is asked for (HANDOFF §6). */
export default function NewIdea() {
  redirect("/door/start");
}
