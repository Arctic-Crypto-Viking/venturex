import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { ThemeToggle } from "@core/components/theme-toggle";
import { getTemplate, getTheme } from "@core/lib/theme";
import { TemplatePicker } from "@core/components/template-picker";
import { Badge, ButtonLink } from "@core/components/ui";
import { getCurrentUser } from "@core/lib/auth";
import { SignOutButton } from "@core/components/sign-out-button";
import { product } from "@product";
import { getCoreDict } from "@core/i18n";
import { LanguagePicker } from "@core/components/language-picker";

export async function generateMetadata() {
  return { title: (await getCoreDict()).login.signIn };
}

/**
 * Sign in and sign up (one page). The product's mark and name lead the card;
 * product.signIn adds a photo (a band above the form on phones, half the page
 * from 1024px) and a label such as "Beta". A person who is already signed in
 * sees which login and can continue or sign out, so switching login never
 * needs a hidden menu.
 */
export default async function LoginPage() {
  const [theme, template, user, t] = await Promise.all([getTheme(), getTemplate(), getCurrentUser(), getCoreDict()]);
  const image = product.signIn?.image;
  const label = product.signIn?.label;
  const lockup = (
    <span className="flex items-center gap-2.5">
      <product.Mark size={36} />
      <span className="font-display text-xl font-semibold tracking-tight text-fg">{product.brand.name}</span>
      {label ? <Badge tone="accent">{label}</Badge> : null}
    </span>
  );
  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-2">
      {image ? (
        <div aria-hidden className="relative h-44 shrink-0 overflow-hidden sm:h-60 lg:sticky lg:top-0 lg:h-dvh">
          <picture>
            <source media="(min-width: 1024px)" srcSet={image.wide} />
            <img src={image.tall} alt="" fetchPriority="high" className="h-full w-full object-cover object-[50%_30%]" />
          </picture>
          {/* scrims made from --bg, so the photo melts into the page in every look and theme */}
          <div className="absolute inset-0 lg:hidden" style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--bg) 10%, transparent) 0%, var(--bg) 100%)" }} />
          <div className="absolute inset-0 hidden lg:block" style={{ background: "linear-gradient(90deg, transparent 55%, var(--bg) 100%)" }} />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col">
        {user?.email ? (
          <div className="mx-auto mt-6 flex w-full max-w-sm flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
            <span className="min-w-0 truncate text-muted">{t.login.signedInAs} <span className="text-fg">{user.email}</span></span>
            <span className="flex items-center gap-1">
              <ButtonLink href={product.homePath} variant="soft" size="sm">{t.login.continue}</ButtonLink>
              <SignOutButton label={t.controls.signOut} />
            </span>
          </div>
        ) : null}
        <Suspense fallback={null}>
          <LoginForm mark={lockup} appName={product.brand.name} signupPath={product.signupPath} privacyPath={product.privacyPath} t={t.login} />
        </Suspense>
        <div className="flex justify-center gap-1 pb-8"><LanguagePicker back="/login" /><TemplatePicker template={template} back="/login" /><ThemeToggle theme={theme} back="/login" /></div>
      </div>
    </div>
  );
}
