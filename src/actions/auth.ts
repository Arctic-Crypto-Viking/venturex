"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@core/lib/supabase/server";
import { product } from "@product";

/**
 * Sign out. Always a form post, never a link: chat previews and mail scanners
 * open links. Deletes the product's per-person cookies (product.signOutCookies)
 * and keeps the look and theme, which belong to the browser.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const store = await cookies();
  for (const name of product.signOutCookies ?? []) store.delete(name);
  redirect("/login");
}
