"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@core/lib/supabase/server";
import { product } from "@product";

/**
 * Sign out. Always a form post, never a link: chat previews and mail scanners
 * open links. Deletes the product's per-person cookies (product.signOutCookies)
 * and keeps the look and theme, which belong to the browser. Lands on the
 * public landing page ("/"), not the sign-in page.
 *
 * Scope "local": this device only. supabase-js defaults to "global", which
 * ends every session the person has, on every device. Signing out elsewhere
 * is Signed-in devices on the Account page (core/src/actions/sessions.ts).
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const store = await cookies();
  for (const name of product.signOutCookies ?? []) store.delete(name);
  redirect("/");
}
