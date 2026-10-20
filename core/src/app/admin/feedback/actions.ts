"use server";

import { redirect } from "next/navigation";
import { createClient } from "@core/lib/supabase/server";
import { getCurrentUser } from "@core/lib/auth";
import { openFeedbackBuildIssue, type FeedbackBuildItem } from "@core/lib/feedback-build";
import { product } from "@product";

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
  if (status === "build") return startBuild(supabase, id, note || null);
  const { error } = await supabase.rpc("admin_feedback_decide", { p_item: id, p_status: status, p_note: note || null });
  if (error) back(`error=${encodeURIComponent(error.message)}`);
  back(`saved=${id}`);
}

/**
 * "Start the build with Claude" (migration 030): open the GitHub issue first, and only
 * when that worked move the suggestion to in_progress with the issue link. If the
 * database step fails after the issue exists, the error names the issue so nothing is lost.
 */
async function startBuild(supabase: Awaited<ReturnType<typeof guard>>, id: string, note: string | null): Promise<void> {
  const { data, error: listError } = await supabase.rpc("admin_feedback_list");
  if (listError) back(`error=${encodeURIComponent(listError.message)}`);
  const item = ((data ?? []) as FeedbackBuildItem[]).find((i) => i.id === id);
  if (!item) back(`error=${encodeURIComponent("That suggestion is not on the board.")}`);
  let url: string;
  try {
    url = await openFeedbackBuildIssue(item!, { note, productName: product.brand.name, adminUrl: `${product.brand.appUrl}/admin/feedback?saved=${id}` });
  } catch (e) {
    back(`error=${encodeURIComponent(e instanceof Error ? e.message : "GitHub did not answer.")}`);
    return;
  }
  const { error } = await supabase.rpc("admin_feedback_start_build", { p_item: id, p_build_url: url, p_note: note });
  if (error) back(`error=${encodeURIComponent(`The issue is open at ${url}, but the status did not change: ${error.message}`)}`);
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
