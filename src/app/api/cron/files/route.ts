import type { NextRequest } from "next/server";
import { createAdminClient } from "@core/lib/supabase/admin";
import { runFilesWorker } from "@core/lib/files/sync";

/**
 * The Library worker (docs/FILES.md §5): syncs due sources, makes thumbnails,
 * stages Social drafts that use a Library file. Called every minute by pg_cron +
 * pg_net with CRON_SECRET as the Bearer token (SETUP-GUIDE Part 16), like the
 * Social worker; safe to call twice (every claim is a lock, every step idempotent).
 */
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    return Response.json(await runFilesWorker(createAdminClient()));
  } catch (err) {
    console.error("files worker run", err);
    return Response.json({ error: err instanceof Error ? err.message : "files worker failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
