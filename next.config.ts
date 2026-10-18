import type { NextConfig } from "next";

/**
 * On Vercel the production address is known at build time
 * (VERCEL_PROJECT_PRODUCTION_URL, no scheme). Use it as the site URL when
 * NEXT_PUBLIC_SITE_URL is not set, so a first deploy works without a second
 * one just to tell the app its own address. Locally nothing changes.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);

const nextConfig: NextConfig = {
  env: siteUrl ? { NEXT_PUBLIC_SITE_URL: siteUrl } : {},
};

export default nextConfig;
