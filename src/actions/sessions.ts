"use server";

import { redirect } from "next/navigation";
import { createClient } from "@core/lib/supabase/server";
import { safeNext } from "@core/lib/safe-next";

/**
 * Signed-in devices (migration 037). Plain form posts that return to the page
 * they were pressed on with ?devices=<outcome> for the notice. Who may end
 * which session is decided in the database (end_my_session: own sessions only,
 * never the current one) and by Supabase Auth (scope "others").
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function back(fd: FormData, outcome: "ended" | "others" | "failed"): string {
  const path = safeNext(String(fd.get("back") ?? ""), "/app/account");
  const url = new URL(path, "http://x");
  url.searchParams.set("devices", outcome);
  return `${url.pathname}${url.search}#devices`;
}

/** Sign out one other device. */
export async function endSessionAction(fd: FormData): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  const id = String(fd.get("session") ?? "");
  const { error } = UUID.test(id) ? await supabase.rpc("end_my_session", { p_session: id }) : { error: true };
  redirect(back(fd, error ? "failed" : "ended"));
}

/** Sign out every device except this one. */
export async function signOutOthersAction(fd: FormData): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  const { error } = await supabase.auth.signOut({ scope: "others" });
  redirect(back(fd, error ? "failed" : "others"));
}
