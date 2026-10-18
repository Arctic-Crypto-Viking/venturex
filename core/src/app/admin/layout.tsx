import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@core/lib/auth";
import { ButtonLink } from "@core/components/ui";
import { AdminNav } from "./admin-nav";
import { ThemeToggle } from "@core/components/theme-toggle";
import { getTemplate, getTheme } from "@core/lib/theme";
import { TemplatePicker } from "@core/components/template-picker";
import { product } from "@product";
import { SignOutButton } from "@core/components/sign-out-button";
import { getCoreDict } from "@core/i18n";

export const dynamic = "force-dynamic"; // per-user data, never prerendered

/**
 * Superadmin gate for everything under /admin (spec §6). The flag is read from
 * public.users in the database, never from the JWT. Non-superadmins get a 404,
 * not a 403: the admin area does not exist for them. Every admin RPC re-checks
 * app.is_superadmin() in SQL, so this layout is a convenience, not the guard.
 *
 * The "My ventures" item (spec §7) is the only founder-specific UI in the
 * product. Its URL lives in MY_VENTURES_URL so the codebase stays venture-neutral.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await getCurrentUser();
  if (!user?.isSuperadmin) notFound();
  const myVentures = process.env.MY_VENTURES_URL;
  const [theme, template] = await Promise.all([getTheme(), getTemplate()]);
  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-5 pb-16">
      <header className="ap-header ap-header--admin flex flex-col gap-4">
        <div className="ap-header-row">
          <Link href="/admin" className="ap-brand">
            <product.Mark size={24} />
            <span className="truncate">Admin console</span>
            <span className="hidden truncate text-sm text-muted sm:inline">· {user.email}</span>
          </Link>
          <div className="ap-nav shrink-0 gap-2">
            <TemplatePicker template={template} back="/admin" />
            <ThemeToggle theme={theme} back="/admin" />
            <ButtonLink href={product.homePath} variant="ghost" size="sm">Back to app</ButtonLink>
            <SignOutButton label={(await getCoreDict()).controls.signOut} />
            {myVentures ? <a href={myVentures} className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm hover:bg-surface-2">My ventures</a> : null}
          </div>
        </div>
        <AdminNav extra={product.admin.nav ?? []} />
      </header>
      {children}
    </div>
  );
}
