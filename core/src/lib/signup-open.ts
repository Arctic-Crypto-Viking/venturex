import { publicEnv } from "@core/lib/env";

/**
 * Whether a new address may sign up, read from Supabase Auth itself
 * (GET /auth/v1/settings → disable_signup). The switch is Supabase → Authentication
 * → Sign In / Providers → "Allow new users to sign up": GoTrue enforces it on every
 * path except the admin API, which is what Invite a tester and the dev link script
 * use, so a closed product still lets invited people in. There is deliberately no
 * second flag in the database: a copy could drift from the switch that is enforced.
 *
 * Only the sign-in screen reads this (to stop asking Auth to create users and to say
 * the product is invite-only). If the settings call fails it answers `true`, so the
 * form behaves as before; Auth still refuses a new address when sign-up is closed.
 */
export async function signupOpen(): Promise<boolean> {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) return true;
  try {
    const res = await fetch(`${publicEnv.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: publicEnv.supabaseAnonKey },
      next: { revalidate: 60 },
    });
    if (!res.ok) return true;
    const settings = (await res.json()) as { disable_signup?: boolean };
    return settings.disable_signup !== true;
  } catch {
    return true;
  }
}
