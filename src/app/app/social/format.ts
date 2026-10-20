/** Server-side date words for the Social screens (the queue's day headings are made in the browser, in the person's zone). */
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const fmtDay = (iso: string) => day.format(new Date(iso));

/**
 * "2026-10-18T19:30" as typed in the browser, in the browser's IANA zone → the instant.
 * Done twice because the zone's offset at the guessed instant may differ (DST edge).
 */
export function zonedToUtc(local: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let zone = tz;
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); } catch { zone = "UTC"; }
  const off1 = offsetMs(guess, zone);
  let result = guess - off1;
  const off2 = offsetMs(result, zone);
  if (off2 !== off1) result = guess - off2;
  return new Date(result);
}

function offsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - utcMs;
}
