import { createClient } from "@core/lib/supabase/server";

export type CurrentUser = { id: string; email: string | null; isSuperadmin: boolean };
export type CurrentAccount = {
  id: string;
  name: string;
  slug: string;
  role: string;
  accessStatus: string;
  isInternal: boolean;
};

/** The signed-in user, with the superadmin flag read from the DATABASE (never the token). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;
  const { data: row } = await supabase
    .from("users")
    .select("id, email, is_superadmin")
    .eq("id", sub)
    .maybeSingle();
  return {
    id: sub,
    email: row?.email ?? (data?.claims?.email as string | undefined) ?? null,
    isSuperadmin: Boolean(row?.is_superadmin),
  };
}

/**
 * The accounts the user can open (RLS already limits this to memberships).
 * A failed read throws: an empty list means "no account yet" and sends the person
 * to the sign-up wizard, so a passing database error must never look like one.
 */
export async function getMyAccounts(): Promise<CurrentAccount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("account_members")
    .select("role, accounts ( id, name, slug, access_status, is_internal )")
    .eq("status", "active");
  if (error) throw new Error(`Could not read your accounts: ${error.message}`);
  return (data ?? [])
    .map((m) => {
      const a = m.accounts as unknown as {
        id: string; name: string; slug: string; access_status: string; is_internal: boolean;
      } | null;
      if (!a) return null;
      return {
        id: a.id,
        name: a.name,
        slug: a.slug,
        role: m.role as string,
        accessStatus: a.access_status,
        isInternal: a.is_internal,
      } satisfies CurrentAccount;
    })
    .filter((x): x is CurrentAccount => x !== null);
}

/** The account to work in: ?account=<id> if the user belongs to it, else the first one. */
export async function getCurrentAccount(preferredId?: string | null): Promise<CurrentAccount | null> {
  const accounts = await getMyAccounts();
  if (accounts.length === 0) return null;
  return accounts.find((a) => a.id === preferredId) ?? accounts[0];
}
