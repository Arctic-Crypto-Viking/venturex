"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@core/lib/auth";
import { createClient } from "@core/lib/supabase/server";
import { createAdminClient } from "@core/lib/supabase/admin";
import {
  FEEDBACK_KINDS, UnusableFeedbackError, formatFeedback,
  type BoardCandidate, type FeedbackKind,
} from "@core/lib/feedback-format";
import { product } from "@product";

const PATH = "/app/feedback";
export type DraftState = { error: string } | undefined;

/**
 * Step 1: what the person wrote → a draft (reformatted on the server, written with
 * the service role so the browser cannot supply its own "reformatted" text) and the
 * board suggestions that ask for the same thing. Step 2 is the page with ?draft=.
 */
export async function draftFeedbackAction(_prev: DraftState, fd: FormData): Promise<DraftState> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${PATH}`);
  const text = String(fd.get("text") ?? "").trim();
  const k = String(fd.get("kind") ?? "");
  const kindHint = FEEDBACK_KINDS.includes(k as FeedbackKind) ? (k as FeedbackKind) : null;
  if (text.length < 10) return { error: "Write a sentence or two, so others understand what you mean." };
  if (text.length > 4000) return { error: "That is more than 4,000 characters. Keep it to the one thing that matters most." };

  const supabase = await createClient();
  const { data: status } = await supabase.rpc("feedback_status");
  if ((status as { drafts_left?: number } | null)?.drafts_left === 0) {
    return { error: "You have sent a lot of feedback today. Thank you! Try again tomorrow." };
  }
  const { data: board } = await supabase
    .from("feedback_board")
    .select("id, title, summary")
    .in("status", ["open", "approved", "in_progress", "shipped"])
    .order("vote_count", { ascending: false })
    .limit(150);

  let formatted;
  try {
    formatted = await formatFeedback({ text, kindHint, candidates: (board ?? []) as BoardCandidate[], productName: product.brand.name });
  } catch (e) {
    if (e instanceof UnusableFeedbackError) return { error: "We could not find a suggestion or a problem in that. Say what you would like, or what got in your way." };
    throw e;
  }

  const { data: id, error } = await createAdminClient().rpc("feedback_create_draft", {
    p_user: user.id, p_kind: formatted.kind, p_title: formatted.title, p_summary: formatted.summary,
    p_body: text, p_ai: formatted.ai,
  });
  if (error) {
    return { error: error.message.includes("daily feedback limit") ? "You have sent a lot of feedback today. Thank you! Try again tomorrow." : "It could not be saved. Try again in a minute." };
  }
  const m = formatted.matchIds.length ? `&m=${formatted.matchIds.join(",")}` : "";
  redirect(`${PATH}?draft=${id}${m}`);
}

export async function publishFeedbackAction(draftId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("feedback_publish", { p_item: draftId });
  if (error) redirect(`${PATH}?error=${encodeURIComponent("That draft is gone. Write it again?")}`);
  redirect(`${PATH}?posted=${draftId}`);
}

/** The person's point is already on the board: their vote goes there, their draft goes. */
export async function voteInsteadAction(draftId: string, itemId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("feedback_vote", { p_item: itemId });
  if (error) redirect(`${PATH}?draft=${draftId}&error=${encodeURIComponent("That suggestion is closed for votes.")}`);
  await supabase.rpc("feedback_discard", { p_item: draftId });
  redirect(`${PATH}?voted=${itemId}`);
}

export async function discardFeedbackAction(draftId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("feedback_discard", { p_item: draftId });
  redirect(PATH);
}

export async function toggleVoteAction(itemId: string, voted: boolean): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc(voted ? "feedback_unvote" : "feedback_vote", { p_item: itemId });
  revalidatePath(PATH);
}
