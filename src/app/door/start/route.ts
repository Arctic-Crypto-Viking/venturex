import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@core/lib/supabase/server";
import { getCurrentUser } from "@core/lib/auth";
import { clearDoor, emptyDoor, writeDoor } from "@/lib/door-cookie";

export const dynamic = "force-dynamic";

/**
 * GET /door/start — a fresh anonymous run (the landing page's button, "Run
 * another idea"). With ?rescore=<account id> it starts a re-score of one of
 * the person's ventures: the five lines come from the record and the run goes
 * straight to the gates; the verdict screen asks for the changed fact when
 * the venture is killed. A route handler, because a link cannot post and a
 * page cannot set cookies.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rescore = url.searchParams.get("rescore");
  if (!rescore) {
    await clearDoor();
    return NextResponse.redirect(new URL("/door/intake/1", url.origin));
  }
  if (!/^[0-9a-f-]{36}$/i.test(rescore)) return NextResponse.redirect(new URL("/app", url.origin));
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/door/start?rescore=${rescore}`)}`, url.origin));
  const supabase = await createClient();
  const { data: v } = await supabase
    .from("ventures")
    .select("account_id, title, customer, uses_today, ship_in_30_days, unfair_reach")
    .eq("account_id", rescore)
    .maybeSingle();
  if (!v) return NextResponse.redirect(new URL("/app", url.origin));
  const s = emptyDoor();
  s.rescore = v.account_id as string;
  s.intake = {
    title: (v.title as string) ?? "", customer: (v.customer as string) ?? "", uses_today: (v.uses_today as string) ?? "",
    ship_in_30_days: (v.ship_in_30_days as string) ?? "", unfair_reach: (v.unfair_reach as string) ?? "",
  };
  await writeDoor(s);
  return NextResponse.redirect(new URL("/door/gate/1", url.origin));
}
