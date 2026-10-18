import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@core/lib/auth";
import { brand } from "@/brand";
import { Mark } from "@/components/brand";
import { Badge } from "@core/components/ui";
import { SignOutButton } from "@core/components/sign-out-button";
import { ThemeToggle } from "@core/components/theme-toggle";
import { getTemplate, getTheme } from "@core/lib/theme";
import { TemplatePicker } from "@core/components/template-picker";
import { LanguagePicker } from "@core/components/language-picker";
import { getDict } from "@/i18n";
import { getCoreDict } from "@core/i18n";

export const dynamic = "force-dynamic"; // per-user data, never prerendered

/**
 * Header for the signed-in area, on the seven `ap-*` hooks so every look can
 * move it (core/README.md step 7): the mark and name, the sections, the admin
 * link for superadmins (404 for everyone else), the pickers and sign-out.
 * Venture-neutral: nothing here names another venture.
 */
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/app");
  const [theme, template, t, core] = await Promise.all([getTheme(), getTemplate(), getDict(), getCoreDict()]);

  return (
    <div className="ap-shell mx-auto min-h-dvh max-w-3xl px-5 pb-16">
      <header className="ap-header">
        <div className="ap-header-row">
          <Link href="/app" className="ap-brand">
            <Mark size={24} />
            <span>{brand.name}</span>
            <Badge tone="accent" className="shrink-0">{t.common.beta}</Badge>
          </Link>
          <nav className="ap-nav" aria-label="Sections">
            <Link href="/app" className="ap-link ap-link--wide">{t.common.myVentures}</Link>
            <Link href="/app/feedback" className="ap-link ap-link--wide">{t.common.feedback}</Link>
            {user.isSuperadmin ? <Link href="/admin" className="ap-link">{t.common.admin}</Link> : null}
            <LanguagePicker back="/app" />
            <TemplatePicker template={template} back="/app" />
            <ThemeToggle theme={theme} back="/app" />
            <SignOutButton className="ap-link" label={core.controls.signOut} />
          </nav>
        </div>
      </header>
      <div className="ap-content pt-6">{children}</div>
    </div>
  );
}
