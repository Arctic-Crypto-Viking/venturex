import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/brand";
import { Badge, ButtonLink, Card } from "@core/components/ui";
import { brand } from "@/brand";
import { getTemplate, getTheme } from "@core/lib/theme";
import { TemplatePicker } from "@core/components/template-picker";
import { LanguagePicker } from "@core/components/language-picker";
import { ThemeToggle } from "@core/components/theme-toggle";
import { getDict, type Dict } from "@/i18n";

/**
 * Public landing page, from the sketch's page 1: one promise ("find out this
 * week whether your idea deserves your next 30 days"), one door ("Run the five
 * gates — free"), the three states, and what happens after a GO. Built only
 * from tokens, so it follows every look and both themes. No price anywhere
 * (HANDOFF §10 D3). The door button starts a fresh anonymous run (/door/start);
 * nothing is saved until the person asks for a verdict and signs in.
 */

const DOOR = "/door/start";
const SIGNIN = "/login";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict();
  return {
    title: { absolute: `${brand.name}: ${brand.tagline}` },
    description: brand.description,
    openGraph: { title: t.landing.title, description: brand.description, type: "website", siteName: brand.name },
  };
}

export default async function Home() {
  const [theme, template, t] = await Promise.all([getTheme(), getTemplate(), getDict()]);
  return (
    <div className="relative overflow-x-clip">
      <Nav t={t} />
      <main className="mx-auto flex max-w-3xl flex-col gap-16 px-5 pb-20 pt-10 sm:pt-16">
        <Hero t={t} />
        <How t={t} />
        <States t={t} />
        <After t={t} />
      </main>
      <footer className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 border-t border-border px-5 py-8 text-xs text-faint">
        <span className="flex items-center gap-2">
          <Mark size={18} /> © {new Date().getFullYear()} {brand.name}
        </span>
        <span>{t.landing.footer.made}</span>
        <Link href="/privacy" className="underline-offset-4 hover:text-fg hover:underline">{t.common.privacy}</Link>
        <span className="ml-auto flex items-center gap-1">
          <LanguagePicker back="/" />
          <TemplatePicker template={template} back="/" />
          <ThemeToggle theme={theme} back="/" />
        </span>
      </footer>
    </div>
  );
}

function Nav({ t }: { t: Dict }) {
  return (
    <header className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
      <Link href="/" className="flex items-center gap-2.5">
        <Mark size={26} />
        <span className="font-display text-[17px] font-semibold tracking-tight">{brand.name}</span>
        <Badge tone="accent">{t.common.beta}</Badge>
      </Link>
      <ButtonLink href={SIGNIN} variant="ghost" size="sm">{t.common.signIn}</ButtonLink>
    </header>
  );
}

function Hero({ t }: { t: Dict }) {
  return (
    <section className="flex flex-col gap-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{t.landing.eyebrow}</p>
      <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">{t.landing.title}</h1>
      <p className="max-w-xl text-lg leading-relaxed text-muted">{t.landing.body}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <ButtonLink href={DOOR} size="lg">{t.common.runTheGates}</ButtonLink>
        <span className="text-sm text-faint">{t.common.nothingSaved}</span>
      </div>
    </section>
  );
}

function How({ t }: { t: Dict }) {
  return (
    <section className="flex flex-col gap-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t.landing.how.eyebrow}</p>
      <ol className="grid gap-3 sm:grid-cols-2">
        {t.landing.how.steps.map((s, i) => (
          <li key={s.title}>
            <Card className="h-full">
              <p className="font-mono text-xs text-faint">{String(i + 1).padStart(2, "0")}</p>
              <h2 className="mt-1 text-lg font-semibold leading-snug">{s.title}</h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{s.body}</p>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}

function States({ t }: { t: Dict }) {
  const rows = [
    { tone: "success" as const, ...t.landing.states.go },
    { tone: "warn" as const, ...t.landing.states.parked },
    { tone: "neutral" as const, ...t.landing.states.killed },
  ];
  return (
    <section className="flex flex-col gap-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t.landing.states.eyebrow}</p>
      <Card>
        <dl className="flex flex-col divide-y divide-border">
          {rows.map((r) => (
            <div key={r.name} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:grid sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
              <dt className="flex items-center gap-2">
                <Badge tone={r.tone}>{r.name}</Badge>
                <span className="text-sm text-muted">{r.when}</span>
              </dt>
              <dd className="text-[15px] leading-relaxed">{r.what}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  );
}

function After({ t }: { t: Dict }) {
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t.landing.after.eyebrow}</p>
      <h2 className="font-display text-2xl font-semibold tracking-tight">{t.landing.after.title}</h2>
      <p className="max-w-xl text-[15px] leading-relaxed text-muted">{t.landing.after.body}</p>
      <div className="pt-2"><ButtonLink href={DOOR} variant="secondary">{t.common.runTheGates}</ButtonLink></div>
    </section>
  );
}
