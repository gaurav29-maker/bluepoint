import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Belt and braces. Every private page already sets `robots: { index: false }`
 * in its own metadata, but a booking URL is a bare uuid that acts as a
 * capability — it is the only thing standing between a stranger and somebody's
 * session — and a page that is merely noindex has still been fetched by the
 * crawler that read the directive. Keeping those paths out of the crawl in the
 * first place is the stronger statement.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/ops", "/member", "/expert", "/booking/"],
    },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
