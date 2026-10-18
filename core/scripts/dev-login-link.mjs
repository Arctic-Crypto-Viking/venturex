#!/usr/bin/env node
/**
 * Sign-in link WITHOUT e-mail — for the founder's own sign-in, and the fallback
 * for inviting a tester (the first way is Admin → Accounts → Invite a tester,
 * which makes the same link: both call core/src/lib/sign-in-link.mjs).
 *
 * Asks Supabase (with the secret key from .env.local) to generate a one-time
 * sign-in token for an e-mail address and prints a link to open in a browser.
 * No mail is sent, so the built-in mailer's limits (it only delivers to the
 * project's own team members) don't matter. Creates the user if it does not
 * exist yet.
 *
 *   node core/scripts/dev-login-link.mjs you@example.com   (products keep scripts/dev-login-link.mjs as a one-line alias)
 *
 * The link points at NEXT_PUBLIC_SITE_URL (default http://localhost:3000, which
 * needs `npm run dev` running). For the online app, put its address in front:
 *
 *   NEXT_PUBLIC_SITE_URL=https://YOUR-APP.vercel.app node scripts/dev-login-link.mjs tester@example.com
 *
 * The link opens a page with one button, Continue; pressing it signs in as
 * that address. (Opening the link alone spends nothing, so a chat app's link
 * preview cannot use it up.) Open it yourself only for your own address; a
 * tester's link goes to that tester and to nobody else.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createSignInLink } from "../src/lib/sign-in-link.mjs";

const email = process.argv[2];
if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/dev-login-link.mjs you@example.com");
  process.exit(1);
}

// minimal .env.local reader (no extra dependency)
let env = {};
try {
  const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  console.error("Could not read .env.local — run this from the project folder (where package.json is).");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const secret =
  process.env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local.");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
let link;
try {
  ({ link } = await createSignInLink(admin, email, site));
} catch (e) {
  console.error("Supabase refused:", e instanceof Error ? e.message : String(e));
  process.exit(1);
}
console.log("\nOpen this in your browser. It works once, and for one hour unless the project's Email OTP Expiration says otherwise:\n");
console.log(link + "\n");
