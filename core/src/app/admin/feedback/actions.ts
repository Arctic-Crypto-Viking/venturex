"use server";

import { redirect } from "next/navigation";
import { createClient } from "@core/lib/supabase/server";
import { getCurrentUser } from "@core/lib/auth";

/** Admin → Feedback. Every write is an RPC that re-checks the superadmin in SQL and writes the audit entry. */
const back = (q: string) => redirect(`/admin/feedback?${q}`);

async function guard() {
  const user = await getCurrentUser();
  if (!user?.isSuperadmin) redirect("/404");
  return createClient();
}

export async function decideFeedbackAction(fd: FormData): Promise<void> {
  const supabase = await guard();
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "");
  const note = String(fd.get("note") ?? "").trim();
  const { error } = await supabase.rpc("admin_feedback_decide", { p_item: id, p_status: status, p_note: note || null });
  if (error) back(`error=${encodeURIComponent(error.message)}`);
  back(`saved=${id}`);
}

export async function editFeedbackAction(fd: FormData): Promise<void> {
  const supabase = await guard();
  const id = String(fd.get("id") ?? "");
  const { error } = await supabase.rpc("admin_feedback_edit", {
    p_item: id,
    p_kind: String(fd.get("kind") ?? "idea"),
    p_title: String(fd.get("title") ?? ""),
    p_summary: String(fd.get("summary") ?? ""),
  });
  if (error) back(`error=${encodeURIComponent(error.message)}`);
  back(`saved=${id}`);
}

export async function mergeFeedbackAction(fd: FormData): Promise<void> {
  const supabase = await guard();
  const from = String(fd.get("id") ?? "");
  const into = String(fd.get("into") ?? "");
  if (!into) back(`error=${encodeURIComponent("Pick the suggestion to merge into.")}`);
  const { error } = await supabase.rpc("admin_feedback_merge", { p_from: from, p_into: into });
  if (error) back(`error=${encodeURIComponent(error.message)}`);
  back(`saved=${into}`);
}
