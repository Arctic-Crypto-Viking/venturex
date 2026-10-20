"use server";

import { redirect } from "next/navigation";
import { createClient } from "@core/lib/supabase/server";
import { getCurrentUser } from "@core/lib/auth";

/** The kill switch, through the audited admin_set_flag (014), back to this page. */
export async function setPublishingAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.isSuperadmin) redirect("/404");
  const enabled = String(fd.get("enabled") ?? "") === "1";
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_flag", { p_key: "social.publishing", p_enabled: enabled });
  if (error) redirect(`/admin/social?error=${encodeURIComponent(error.message)}`);
  redirect("/admin/social");
}

/**
 * Plan rules (038, docs/SOCIAL-MANAGER.md §4.4): a rule's cards as JSON, written
 * through the audited admin_social_set_plan_rule. The database checks the shape
 * (offset, family, format, snap); a bad JSON never reaches it.
 */
export async function saveRuleAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.isSuperadmin) redirect("/404");
  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const key = str("key").toLowerCase();
  let posts: unknown;
  try { posts = JSON.parse(str("posts") || "[]"); } catch { redirect(`/admin/social?error=${encodeURIComponent(`Rule ${key}: the cards are not valid JSON.`)}`); }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_social_set_plan_rule", {
    p_key: key, p_trigger_kind: str("trigger_kind").toLowerCase(), p_name: str("name").slice(0, 80) || key, p_posts: posts, p_active: str("is_active") === "1",
  });
  if (error) redirect(`/admin/social?error=${encodeURIComponent(`Rule ${key}: ${error.message.slice(0, 300)}`)}`);
  redirect(`/admin/social?saved=${encodeURIComponent(key)}#rules`);
}
