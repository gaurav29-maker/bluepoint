import type { MetadataRoute } from "next";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { experts } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: "weekly", priority: 1 },
    /*
     * The discovery page. Written into this list late, because the sitemap
     * predates it — and it is the destination every "find an expert" call to
     * action points at, so its absence was the worst single omission here.
     */
    { url: `${BASE}/experts`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/apply`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/legal/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/legal/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/legal/refunds`, changeFrequency: "yearly", priority: 0.3 },
  ];

  /*
   * Only live experts. A draft profile 404s, and listing one would advertise
   * somebody who has not been published yet — the same mistake the approval
   * flow is careful not to make.
   */
  try {
    const live = await db
      .select({ slug: experts.slug, updatedAt: experts.updatedAt })
      .from(experts)
      .where(eq(experts.status, "live"))
      .orderBy(asc(experts.slug));

    return [
      ...staticPages,
      ...live.map((e) => ({
        url: `${BASE}/experts/${e.slug}`,
        lastModified: e.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    // No database is not a reason to serve no sitemap at all.
    return staticPages;
  }
}
