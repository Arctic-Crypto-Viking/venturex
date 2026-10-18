import { redirect } from "next/navigation";
import { product } from "@product";
import { Button } from "@core/components/ui";
import { getCoreDict } from "@core/i18n";
import { fill } from "@core/lib/i18n-shared";

export async function generateMetadata() {
  return {
    title: (await getCoreDict()).continuePage.title,
    robots: { index: false, follow: false },
    referrer: "no-referrer" as const, // the one-time token is in this page's address
  };
}

/**
 * Where a sign-in link lands (via GET /auth/confirm). One button; pressing it
 * POSTs the one-time token to /auth/confirm, which signs the person in.
 * Opening this page spends nothing, so a chat app's link preview or a mail
 * scanner cannot use the link up before its owner taps it. A plain form: it
 * works before hydration and inside in-app browsers.
 */
export default async function ContinueSignIn({ searchParams }: PageProps<"/auth/continue">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const tokenHash = one(sp.token_hash);
  const type = one(sp.type);
  if (!tokenHash || !type) redirect("/login?error=link");
  const t = (await getCoreDict()).continuePage;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-7">
        <product.Mark size={36} />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1.5 text-[15px] text-muted">{fill(t.body, { app: product.brand.name })}</p>
        <form method="post" action="/auth/confirm" className="mt-6">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="next" value={one(sp.next)} />
          <Button type="submit" size="lg" full>{t.button}</Button>
        </form>
        <p className="mt-4 text-sm leading-relaxed text-muted">{t.once}</p>
      </div>
      <p className="mt-5 text-center text-xs text-faint">{product.brand.name}</p>
    </main>
  );
}
