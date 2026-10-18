"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@core/lib/supabase/admin";
import { createClient } from "@core/lib/supabase/server";
import { getCurrentUser } from "@core/lib/auth";
import { publicEnv } from "@core/lib/env";
import { createSignInLink } from "@core/lib/sign-in-link.mjs";
import { product } from "@product";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InviteState =
  | { email: string; link: string; newLogin: boolean; site: string }
  | { error: string }
  | undefined;

/**
 * Invite a tester (core): a one-time sign-in link for an e-mail address, made here
 * instead of in Terminal. The link comes from createSignInLink(), the same code the
 * fallback script uses (core/src/lib/sign-in-link.mjs): type=email, and /auth/confirm
 * → /auth/continue, where one button spends the token. Nothing is sent; the founder
 * sends the link.
 *
 * Every invite is written to the audit log as the signed-in superadmin (log_audit
 * re-checks that in SQL): action `invite`, entity type `email`, entity id the
 * address, and the login it belongs to. If that write fails the link is not shown.
 * Deleting the account later clears the address from these entries (migration 020).
 *
 * Refused: an address that belongs to a founder (superadmin) login. That link would
 * sign whoever opens it in as a superadmin; the founder's own sign-in link comes from
 * the script.
 */
export async function inviteTesterAction(_prev: InviteState, fd: FormData): Promise<InviteState> {
  const user = await getCurrentUser();
  if (!user?.isSuperadmin) redirect("/404");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return { error: "Type one e-mail address, like name@example.com." };

  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "The server has no SUPABASE_SECRET_KEY, so it cannot make a link. Use the script instead (setup guide, Part 12, stage 1)." };
  }
  const founderLogin = "That address belongs to a founder login. A link for it signs in as a superadmin, so it is not made here; your own link comes from the script.";
  const pattern = email.replace(/[\\%_]/g, (c) => `\\${c}`); // ilike, matched literally
  const { data: existing, error: lookupError } = await admin.from("users").select("is_superadmin").ilike("email", pattern).limit(1);
  if (lookupError) return { error: `The address could not be checked (${lookupError.message}). No link was made.` };
  if (existing?.[0]?.is_superadmin) return { error: founderLogin };

  let made: { link: string; userId: string; newLogin: boolean };
  try {
    made = await createSignInLink(admin, email, publicEnv.siteUrl);
  } catch (e) {
    return { error: `Supabase refused: ${e instanceof Error ? e.message : String(e)}` };
  }
  // the same check by login id, in case the address was stored with other letters
  const { data: owner } = await admin.from("users").select("is_superadmin").eq("id", made.userId).maybeSingle();
  if (owner?.is_superadmin) return { error: founderLogin };

  const supabase = await createClient();
  const { error: auditError } = await supabase.rpc("log_audit", {
    p_action: "invite",
    p_entity_type: "email",
    p_entity_id: email,
    p_account: null,
    p_before: null,
    p_after: { user_id: made.userId, new_login: made.newLogin },
  });
  if (auditError) {
    return { error: `The invite could not be written to the audit log (${auditError.message}), so the link is not shown. Try again: the unshown link reaches nobody and expires on its own.` };
  }
  return { email, link: made.link, newLogin: made.newLogin, site: publicEnv.siteUrl };
}

/**
 * View-as (spec §6, §10.3): opens an audited impersonation session through
 * admin_start_view_as(), which re-checks users.is_superadmin in SQL. Read-only
 * in Week 1 — writes into a customer's account need the owner's consent.
 */
export async function startViewAsAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.isSuperadmin) redirect("/404");
  const accountId = String(fd.get("account") ?? "");
  const reason = String(fd.get("reason") ?? "").trim();
  const supabase = await createClient();
  const { data: sessionId, error } = await supabase.rpc("admin_start_view_as", { p_account: accountId, p_reason: reason || null });
  if (error) redirect(`/admin/accounts/${accountId}?error=${encodeURIComponent(error.message)}`);
  redirect(`/admin/accounts/${accountId}/view-as?session=${String(sessionId)}`);
}

export async function endViewAsAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.isSuperadmin) redirect("/404");
  const accountId = String(fd.get("account") ?? "");
  const sessionId = String(fd.get("session") ?? "");
  const supabase = await createClient();
  await supabase.rpc("admin_end_view_as", { p_session: sessionId });
  redirect(`/admin/accounts/${accountId}`);
}

/** Per-account entitlement override (admin_set_account_entitlement, migration 014: validated + audited in SQL). Empty value = remove. */
export async function setEntitlementAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.isSuperadmin) redirect("/404");
  const accountId = String(fd.get("account") ?? "");
  const feature = String(fd.get("feature") ?? "");
  const kind = String(fd.get("kind") ?? "");
  const raw = String(fd.get("value") ?? "").trim();
  const reason = String(fd.get("reason") ?? "").trim();
  let value: unknown = null;
  if (raw !== "") {
    if (kind === "flag") value = raw === "true" || raw === "on" || raw === "1";
    else {
      const n = Number(raw);
      if (!Number.isFinite(n)) redirect(`/admin/accounts/${accountId}?error=${encodeURIComponent("Value must be a number (-1 = unlimited).")}`);
      value = Math.trunc(n);
    }
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_account_entitlement", { p_account: accountId, p_feature_key: feature, p_value: value, p_reason: reason || null, p_expires_at: null });
  if (error) redirect(`/admin/accounts/${accountId}?error=${encodeURIComponent(error.message)}`);
  redirect(`/admin/accounts/${accountId}`);
}

/**
 * Delete an account (migration 020, core). Three steps, in the only order that works:
 *
 *  1. admin_delete_account() — re-checks superadmin in SQL and refuses the internal
 *     account, the caller's own account, an account owned by a founder login, a wrong
 *     typed name, an empty reason and any account with a payment or an invoice; then
 *     deletes the account with everything in it and writes the audit entry (no name,
 *     no e-mail).
 *  2. The account's folder `<account id>/` in each bucket of product.admin.storageBuckets.
 *     The database does not remove files, and Supabase refuses to delete a user who
 *     still owns Storage objects — so files go first.
 *  3. The owner's login, when step 1 says it is removable (owns no other account, is a
 *     member of none) and step 2 left no file behind.
 *
 * Steps 2 and 3 need the service-role client. It is created before step 1, so a missing
 * key stops the action while nothing has been deleted. What steps 2 and 3 did is written
 * to the audit log as a second entry.
 */
export async function deleteAccountAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.isSuperadmin) redirect("/404");
  const accountId = String(fd.get("account") ?? "");
  if (!UUID.test(accountId)) redirect("/admin/accounts");
  const confirm = String(fd.get("confirm") ?? "");
  const reason = String(fd.get("reason") ?? "").trim();
  // its own parameter: the page shows it inside the Delete box, which is where #delete lands on a phone
  const back = (message: string) => `/admin/accounts/${accountId}?delete_error=${encodeURIComponent(message)}#delete`;

  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch {
    redirect(back("The server has no SUPABASE_SECRET_KEY, so files and the login could not be removed. Nothing was deleted."));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_delete_account", { p_account: accountId, p_confirm: confirm, p_reason: reason });
  if (error) redirect(back(error.message));
  const result = data as { owner_user_id: string; login: string; login_removable: boolean };

  let removed = 0;
  const fileErrors: string[] = [];
  for (const bucket of product.admin.storageBuckets ?? []) {
    const r = await removeStorageFolder(admin, bucket, accountId);
    removed += r.removed;
    if (r.error) fileErrors.push(`${bucket}: ${r.error}`);
  }
  const filesError = fileErrors.length ? fileErrors.join("; ") : null;

  let login = result.login; // "removable" or "kept: <why>"
  if (result.login_removable) {
    if (result.owner_user_id === user.id) login = "kept: your own login"; // SQL refuses this already; never remove the caller
    else if (filesError) login = "kept: files could not be removed first";
    else {
      const { error: e } = await admin.auth.admin.deleteUser(result.owner_user_id);
      login = e ? `kept: ${e.message}` : "removed";
    }
  }
  await supabase.rpc("log_audit", {
    p_action: "delete",
    p_entity_type: "account_cleanup",
    p_entity_id: accountId,
    p_account: accountId,
    p_before: null,
    p_after: { files_removed: removed, files_error: filesError, login },
  });

  const q = new URLSearchParams({ deleted: "1", files: String(removed), login });
  if (filesError) q.set("files_error", filesError);
  redirect(`/admin/accounts?${q.toString()}`);
}

/**
 * Remove every object under `<bucket>/<prefix>/`. Storage lists one level at a time and
 * shows a sub-folder as an entry without an id; folders vanish once they are empty.
 */
async function removeStorageFolder(admin: SupabaseClient, bucket: string, prefix: string): Promise<{ removed: number; error: string | null }> {
  let removed = 0;
  const walk = async (dir: string, depth: number): Promise<string | null> => {
    if (depth > 6) return "the folder is nested deeper than expected";
    for (let round = 0; round < 50; round++) {
      const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 100 });
      if (error) return error.message;
      if (!data || data.length === 0) return null;
      const folders = data.filter((x) => !x.id).map((x) => `${dir}/${x.name}`);
      const files = data.filter((x) => Boolean(x.id)).map((x) => `${dir}/${x.name}`);
      for (const f of folders) {
        const e = await walk(f, depth + 1);
        if (e) return e;
      }
      if (files.length === 0) return null; // only folders were listed, and they are empty now
      const { error: e } = await admin.storage.from(bucket).remove(files);
      if (e) return e.message;
      removed += files.length;
    }
    return "the folder did not empty";
  };
  const error = UUID.test(prefix) ? await walk(prefix, 0) : "not an account id";
  return { removed, error };
}
