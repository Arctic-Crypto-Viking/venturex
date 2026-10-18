"use server";

import { redirect } from "next/navigation";
import { createClient } from "@core/lib/supabase/server";
import { getCurrentUser } from "@core/lib/auth";

/** Settings and flags are edited through RPCs that re-check the superadmin in SQL and audit the real actor. */
export async function setSettingAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.isSuperadmin) redirect("/404");
  const key = String(fd.get("key") ?? "").trim();
  const raw = String(fd.get("value") ?? "").trim();
  let value: unknown = null;
  if (raw !== "") {
    try {
      value = JSON.parse(raw);
    } catch {
      redirect(`/admin/settings?error=${encodeURIComponent(`${key}: value must be valid JSON`)}`);
    }
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_setting", { p_key: key, p_value: value, p_description: null });
  if (error) redirect(`/admin/settings?error=${encodeURIComponent(error.message)}`);
  redirect(`/admin/settings?saved=${encodeURIComponent(key)}`);
}

export async function setFlagAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.isSuperadmin) redirect("/404");
  const key = String(fd.get("key") ?? "");
  const enabled = String(fd.get("enabled") ?? "") === "1";
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_flag", { p_key: key, p_enabled: enabled });
  if (error) redirect(`/admin/settings?error=${encodeURIComponent(error.message)}`);
  redirect("/admin/settings");
}
