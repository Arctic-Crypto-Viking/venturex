import { createClient } from "@core/lib/supabase/server";
import { endSessionAction, signOutOthersAction } from "@core/actions/sessions";
import { getCoreDict } from "@core/i18n";
import { getLocale } from "@core/lib/i18n";
import { fill } from "@core/lib/i18n-shared";
import { describeUserAgent } from "@core/lib/user-agent";
import { Badge, Button, Card, Notice } from "@core/components/ui";

type Session = {
  id: string;
  created_at: string;
  last_active_at: string | null;
  user_agent: string | null;
  ip: string | null;
  is_current: boolean;
};

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 86400], ["month", 30 * 86400], ["week", 7 * 86400], ["day", 86400], ["hour", 3600], ["minute", 60],
];

/** "5 minutes ago", "yesterday", "now" — in the person's language. */
function ago(iso: string, locale: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "second");
}

/**
 * Signed-in devices (migration 037): every place the person is signed in, this
 * one first, with a Sign out per other device and one for all of them. Reads
 * public.my_sessions() as the person (own rows only). Plain forms, so it works
 * before hydration; the outcome comes back as ?devices= and is passed in as
 * `status`. The product puts it inside a Section on its Account page.
 */
export async function SignedInDevices({ back, status }: { back: string; status?: string | null }) {
  const [core, locale, supabase] = await Promise.all([getCoreDict(), getLocale(), createClient()]);
  const d = core.devices;
  const { data, error } = await supabase.rpc("my_sessions");
  const sessions = [...((data ?? []) as Session[])].sort((a, b) => Number(b.is_current) - Number(a.is_current));
  const others = sessions.filter((s) => !s.is_current).length;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  const notice =
    status === "ended" ? <Notice tone="success">{d.ended}</Notice>
    : status === "others" ? <Notice tone="success">{d.othersEnded}</Notice>
    : status === "failed" ? <Notice tone="danger">{d.failed}</Notice>
    : null;

  if (error) {
    return (
      <Card>
        <p id="devices" className="text-sm text-muted">{d.unavailable}</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <p id="devices" className="scroll-mt-24 text-sm text-muted">{d.intro}</p>
      {notice}
      <ul className="flex flex-col divide-y divide-border">
        {sessions.map((s) => {
          const { browser, os } = describeUserAgent(s.user_agent);
          const device = browser && os ? fill(d.on, { browser, os }) : (browser ?? os ?? d.unknownDevice);
          const meta = [
            s.last_active_at ? fill(d.active, { when: ago(s.last_active_at, locale) }) : null,
            fill(d.signedInOn, { date: date.format(new Date(s.created_at)) }),
            s.ip ? fill(d.ip, { ip: s.ip }) : null,
          ].filter(Boolean).join(" · ");
          return (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-medium">{device}</span>
                  {s.is_current ? <Badge tone="accent">{d.thisDevice}</Badge> : null}
                </div>
                <span className="break-words text-sm text-muted">{meta}</span>
              </div>
              {s.is_current ? null : (
                <form action={endSessionAction}>
                  <input type="hidden" name="session" value={s.id} />
                  <input type="hidden" name="back" value={back} />
                  <Button type="submit" variant="secondary" size="sm" aria-label={fill(d.signOutDevice, { device })}>
                    {d.signOut}
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      {others > 0 ? (
        <div className="flex flex-col gap-2">
          <form action={signOutOthersAction}>
            <input type="hidden" name="back" value={back} />
            <Button type="submit" variant="danger" full>{d.signOutOthers}</Button>
          </form>
          <p className="text-xs text-faint">{d.delay}</p>
        </div>
      ) : (
        <p className="text-sm text-muted">{d.onlyThis}</p>
      )}
    </Card>
  );
}
