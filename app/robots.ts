import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Belt and braces. Every private page also sets `robots: { index: false }` in
 * its own metadata — which was not true when this comment first claimed it.
 * Both pages under /booking are client components, so they could not export
 * metadata and were inheriting the root layout's `index: true`.
 * `app/booking/layout.tsx` carries it for them now, and the verify suite's
 * "no private page is indexable" holds the claim against the rendered HTML
 * rather than against this comment.
 *
 * The second layer earns its place because a booking URL is a bare uuid
 * acting as a capability — it is the only thing standing between a stranger
 * and somebody's session — and a page that is merely noindex has still been
 * fetched by the crawler that read the directive. Keeping those paths out of
 * the crawl in the first place is the stronger statement.
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
