/**
 * A one-time sign-in link, made without e-mail. Platform core, and the only place
 * that knows how such a link is built: the admin console's "Invite a tester"
 * (core/src/app/admin/accounts/actions.ts) and the Terminal fallback
 * (core/scripts/dev-login-link.mjs) both call createSignInLink().
 *
 * Plain JavaScript on purpose. The script runs in plain Node, which strips
 * TypeScript types by default only from 22.18 on, and the `server-only` marker
 * throws outside the bundler. Server-only all the same: it holds no key, and it
 * needs the service-role client, which only server code can create
 * (core/src/lib/supabase/admin.ts imports `server-only`); in a browser it refuses
 * to load.
 *
 * How the link behaves (docs/IMPLEMENTATION-NOTES.md rows 41 and 45; read from
 * supabase/auth internal/api/{mail,verify}.go and models/one_time_token.go):
 * - generateLink({ type: "magiclink" }) makes a one-time token. For an address
 *   without a login, Supabase creates the login and issues a sign-up token instead.
 * - The link says type=email, which accepts both kinds of token.
 * - It opens /auth/confirm, which signs nobody in on GET: it forwards to
 *   /auth/continue, and only the one button there spends the token. A chat
 *   preview or a mail scanner that fetches the link cannot use it up.
 * - It works once, until the project's Email OTP Expiration has passed since it
 *   was made: 3600 seconds (one hour) unless changed under Supabase →
 *   Authentication → Sign In / Providers → Email.
 * - Supabase keeps one token of each kind per login: the first link for a new
 *   address is a sign-up token, later ones are sign-in tokens. So a newer link
 *   replaces an older one of the same kind only, and the first link keeps working
 *   beside a later one; but using any link ends every other link for that login.
 */

if (typeof window !== "undefined") {
  throw new Error("sign-in-link.mjs is server-only: it needs the service-role client.");
}

/** Where a new sign-in lands: the signed-in area of every product (core/README.md, "Conventions"). */
const NEXT_PATH = "/app";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} admin  a service-role client
 * @param {string} email
 * @param {string} siteUrl  the app's own address (publicEnv.siteUrl), e.g. https://app.example.com
 * @returns {Promise<{ link: string, userId: string, newLogin: boolean }>}
 *   newLogin: the address had no login, and Supabase created one with this link.
 *   Throws with Supabase's message when it refuses.
 */
export async function createSignInLink(admin, email, siteUrl) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(error.message);
  // type=email, not type=magiclink: for an address that does not exist yet, Supabase
  // creates the user and issues a sign-up token, and the magiclink check never looks
  // at sign-up tokens — the link failed once and only worked on a second run.
  // type=email accepts both kinds (supabase/auth, internal/api/verify.go).
  const site = siteUrl.replace(/\/+$/, "");
  return {
    link: `${site}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=email&next=${NEXT_PATH}`,
    userId: data.user.id,
    newLogin: data.properties.verification_type === "signup",
  };
}
