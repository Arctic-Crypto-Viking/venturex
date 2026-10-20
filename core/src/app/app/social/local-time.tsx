"use client";

import { useSyncExternalStore } from "react";

/**
 * A time in the reader's own zone and language. The server renders the ISO
 * instant in UTC; the browser swaps in its own wording after mount (the
 * person's zone is unknown on the server), so the markup never disagrees.
 */
export function LocalTime({ iso, mode = "datetime" }: { iso: string; mode?: "datetime" | "time" | "day" }) {
  // false on the server and during hydration, true once the browser owns the markup
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const opts: Intl.DateTimeFormatOptions =
    mode === "time" ? { hour: "2-digit", minute: "2-digit" }
    : mode === "day" ? { weekday: "short", day: "numeric", month: "short" }
    : { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
  const text = mounted ? new Intl.DateTimeFormat(undefined, opts).format(new Date(iso)) : iso.slice(0, 16).replace("T", " ") + " UTC";
  return <time dateTime={iso} suppressHydrationWarning>{text}</time>;
}
