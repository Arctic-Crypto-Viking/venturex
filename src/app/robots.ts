import type { MetadataRoute } from "next";

/**
 * Search engines may read the landing page ("/$" = the home page only), the
 * privacy notice and, later, the public forecast logs (/f/). The app stays out.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/$", "/privacy", "/f/"], disallow: ["/"] }],
  };
}
