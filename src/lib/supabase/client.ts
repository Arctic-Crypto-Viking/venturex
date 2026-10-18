"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requirePublicEnv } from "@core/lib/env";

/** Browser client. Runs with the user's JWT; RLS decides what it sees. */
export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = requirePublicEnv();
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
