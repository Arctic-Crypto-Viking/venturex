import type { NextRequest } from "next/server";
import { createAdminClient } from "@core/lib/supabase/admin";
import { runSocialWorker } from "@core/lib/social/worker";

/**
 * The Social Manager minute worker (docs/SOCIAL-MANAGER.md §4.5). Called every
 * minute by pg_cron + pg_net from the Supabase project with CRON_SECRET as the
 * Bearer token (SETUP-GUIDE Part 15); Vercel Cron could call the same handler.
 * Anyone else gets 401. Safe to call twice in the same minute: every claim is a
 * lock (for update skip locked) and every step is idempotent.
 */
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    return Response.json(await runSocialWorker(createAdminClient()));
  } catch (err) {
    console.error("social worker run", err);
    return Response.json({ error: err instanceof Error ? err.message : "social worker failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
