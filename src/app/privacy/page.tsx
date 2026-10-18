import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Mark } from "@/components/brand";
import { brand, company } from "@/brand";
import { Card, Notice, PageHeader, Section } from "@core/components/ui";
import { getTemplate, getTheme } from "@core/lib/theme";
import { TemplatePicker } from "@core/components/template-picker";
import { LanguagePicker } from "@core/components/language-picker";
import { ThemeToggle } from "@core/components/theme-toggle";

/**
 * Public privacy notice (outside /app, so signed-out visitors can read it).
 * Plain language, built from the schema and the setup as they are today: when
 * a table, a processor, a cookie or a default changes, change this page in the
 * same PR and move UPDATED. The controller is not named yet (HANDOFF §10 D2);
 * the page says so, and no customer is signed up before it is.
 */

const UPDATED = "18 October 2026";

export const metadata: Metadata = {
  title: "Privacy",
  description: `What ${brand.name} stores about you, where it lives, and how to see, change or delete it.`,
};

export default async function PrivacyPage() {
  const [theme, template] = await Promise.all([getTheme(), getTemplate()]);
  const mail = <a href={`mailto:${company.supportEmail}`} className="text-accent underline underline-offset-4">{company.supportEmail}</a>;

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5">
      <header className="flex h-16 items-center">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark size={26} />
          <span className="font-display text-[17px] font-semibold tracking-tight">{brand.name}</span>
        </Link>
      </header>

      <main className="flex flex-col gap-8 pb-12 pt-4">
        <PageHeader
          eyebrow={`Updated ${UPDATED}`}
          title="Privacy"
          subtitle={`What ${brand.name} keeps about you, where it lives, who else handles it, and how to see, change or delete it.`}
        />

        <Card tone="accent">
          <ul className="flex flex-col gap-2 text-[15px] leading-relaxed text-fg">
            <Point>We keep what you put in, so the app can work for you. Nothing more.</Point>
            <Point>Your data is never sold. No ads, no tracking, no analytics cookies.</Point>
            <Point>Nothing you write is shown to anyone else unless you make a venture&apos;s forecast log public yourself.</Point>
            <Point>Write to us any time to see, fix, export or delete what we hold.</Point>
          </ul>
        </Card>

        <Section title="Who is responsible">
          <Prose>
            <p>
              {company.legalName}{company.status ? ` (${company.status})` : ""} runs {brand.name} and decides what
              happens to your data (the &ldquo;controller&rdquo;, in data-protection terms). Questions, requests or
              complaints: {mail}. A person answers, not a bot.
            </p>
            <p>Postal address: {company.address}.</p>
          </Prose>
          {company.status ? (
            <Notice tone="warn">
              {brand.name} is in a private test. The company that will run it is being named; until then nobody is
              invoiced and no customer account is opened beyond the people invited to test it.
            </Notice>
          ) : null}
        </Section>

        <Section title="What we keep">
          <Prose>
            <p>Only what you enter, plus what the app needs to run your account:</p>
          </Prose>
          <Card>
            <Items
              items={[
                ["Your account", "Your e-mail address, when you signed up and last signed in, and your plan."],
                ["Each venture", "The five lines you write about the idea, your answers at the five gates, your scores and their evidence, the verdict and its date, the state the idea is in, and the card: what it is, what it owns, its channel, money in and committed, the next date."],
                ["The workspace", "Your assumptions and facts with their sources, your decisions, your tests with the numbers you set and the results you record, the stage each venture is at, and the people you invite into a venture."],
                ["Feedback", "What you write in Feedback, the tidied-up title and summary made from it, whether it's an idea or a problem, and which suggestions you voted for."],
                ["Invites", "If we invited you: that we sent you a sign-in link, when, and to which address. The address is removed from that record when your account is deleted."],
                ["Help we give you", "When you ask for help, we can open a read-only view of your account. Each time is recorded: who looked, when, and why if a reason was given."],
              ]}
            />
          </Card>
          <Prose>
            <p>
              An idea you run through the door without saving is never written anywhere: it lives in your browser
              for a day and is gone.
            </p>
          </Prose>
        </Section>

        <Section title="What's public">
          <Prose>
            <p>
              Nothing, by default. A venture&apos;s <strong>forecast log</strong> — its state, score, the test you
              set, the number and the result — becomes public only when you switch it on yourself, and you can
              switch it off again. It never shows your assumptions, decisions, notes or the people on the venture.
            </p>
            <p>
              <strong>Feedback</strong> is a shared board: everyone signed in to {brand.name} sees the title and
              summary of each suggestion you post, and how many votes it has. They never see who posted it, who
              voted, or the words you wrote yourself. Only you and we see those.
            </p>
          </Prose>
        </Section>

        <Section title="Where it's processed">
          <Prose>
            <p>
              Two services run {brand.name} for us, and a third handles one thing. They handle your data only to do
              that job. All are US companies; we use the EU locations of the first two.
            </p>
          </Prose>
          <Card>
            <Items
              items={[
                ["Supabase", "The database and sign-in. Frankfurt, Germany."],
                ["Vercel", "Runs the app. The server code runs in Frankfurt, Germany; pages reach you through its worldwide network."],
                ["Anthropic", "Only for Feedback: when you send feedback, its AI model Claude turns what you wrote into a short title and summary, leaves out names and contact details, and checks it against the suggestions already on the board. USA."],
              ]}
            />
          </Card>
          <Prose>
            <p>
              Like any website, these services also log technical details of each visit (such as your IP address and
              browser) to keep the service secure. The only thing sent to an AI provider is the text you write in
              Feedback, and the titles and summaries already on the board, when you press Continue there. Nothing else
              you store (your ideas, answers, scores, tests, decisions) is sent to an AI provider, and no verdict is
              made by an AI: you answer, the rules decide. If that changes, this page changes first.
            </p>
          </Prose>
        </Section>

        <Section title="Cookies">
          <Prose>
            <p>
              We use a few small cookies, all needed for the app to work or to remember a choice you made. None of them
              are for tracking or ads, and there are no third-party cookies, analytics or pixels.
            </p>
          </Prose>
          <Card>
            <Items
              mono
              items={[
                ["ap_theme", "Dark or Bright, as you chose. One year."],
                ["ap_template", "The look you picked. One year."],
                ["ap_lang", "The language you picked. One year."],
                ["nv_door", "Your answers at the door before you save them. One day, and removed when you save."],
                ["sb-…-auth-token", "Keeps you signed in (sometimes split into numbered pieces). Removed when you sign out."],
                ["sb-…-code-verifier", "Used for a moment while you sign in, then removed."],
              ]}
            />
          </Card>
        </Section>

        <Section title="E-mail">
          <Prose>
            <p>
              We send a sign-in e-mail only when you ask for one. A Monday review of your tests will come later, on
              by choice; it is not sent today. We send no other e-mail.
            </p>
          </Prose>
        </Section>

        <Section title="Never sold">
          <Prose>
            <p>
              We don&apos;t sell your data, and we don&apos;t share it with anyone except the services above, which
              only use it to run {brand.name}. The only exception is if the law requires us to hand something over.
            </p>
          </Prose>
        </Section>

        <Section title="Your rights">
          <Prose>
            <p>
              You can see, correct, export or delete what we hold about you, and object to how we use it. Most of it
              you can edit yourself in the app. For anything else, write to {mail} from the address you sign in with,
              and we&apos;ll answer within a month.
            </p>
            <p>
              To delete your account, write to us. We delete it from our admin console: the account and everything
              in it (ventures, answers, tests, decisions), then your sign-in. The record of the deletion keeps neither
              your name nor your e-mail address. Suggestions you posted in Feedback stay on the board without your name
              and without the words you wrote, because others voted on them; your votes go.
            </p>
            <p>If you think we&apos;ve got it wrong, you can also complain to the data protection authority where you live.</p>
          </Prose>
        </Section>

        <Section title="How long we keep it">
          <Prose>
            <p>
              As long as your account exists, until you ask us to delete it. We haven&apos;t set a period yet for
              removing accounts nobody uses; when we do, it will be written here. The technical logs our services keep
              follow their own standard periods.
            </p>
          </Prose>
        </Section>

        <Section title="Changes">
          <Prose>
            <p>
              When this page changes, the date at the top changes too. If a change affects what happens to your data,
              we&apos;ll tell you in the app before it applies.
            </p>
          </Prose>
        </Section>
      </main>

      <footer className="mt-auto flex flex-wrap items-center gap-3 border-t border-border py-6 text-xs text-faint">
        <Link href="/" className="hover:text-fg">← {brand.name}</Link>
        <span className="ml-auto flex items-center gap-1">
          <LanguagePicker back="/privacy" />
          <TemplatePicker template={template} back="/privacy" />
          <ThemeToggle theme={theme} back="/privacy" />
        </span>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function Prose({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-muted">{children}</div>;
}

function Point({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className="text-accent">✓</span>
      <span>{children}</span>
    </li>
  );
}

/** Label + explanation rows; stacked, so long names (cookies) fit at phone width. */
function Items({ items, mono = false }: { items: Array<[string, string]>; mono?: boolean }) {
  return (
    <dl className="flex flex-col divide-y divide-border">
      {items.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
          <dt className={mono ? "break-all font-mono text-[13px] text-fg" : "text-sm font-semibold text-fg"}>{k}</dt>
          <dd className="text-sm leading-relaxed text-muted">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
