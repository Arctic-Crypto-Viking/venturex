import { ButtonLink } from "@core/components/ui";
import { getCurrentUser } from "@core/lib/auth";
import { SignOutButton } from "@core/components/sign-out-button";
import { fill } from "@core/lib/i18n-shared";
import { getDict } from "@/i18n";

/**
 * 404. The admin console answers 404 to anyone but the superadmin (rule 3), so
 * a signed-in person here may simply be on the wrong login: say which one, and
 * offer a way out.
 */
export default async function NotFound() {
  const [user, d] = await Promise.all([getCurrentUser(), getDict()]);
  const t = d.notFound;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-5 text-center">
      <p className="text-7xl font-semibold tracking-tight text-faint">404</p>
      <p className="mt-2 text-[15px] text-muted">{t.body}</p>
      <div className="mt-6"><ButtonLink href="/" variant="secondary">{t.back}</ButtonLink></div>
      {user?.email ? (
        <div className="mt-8 flex flex-col items-center gap-1 text-sm text-muted">
          <p>{fill(t.signedInAs, { email: user.email })}</p>
          <SignOutButton label={t.signOut} />
        </div>
      ) : null}
    </main>
  );
}
