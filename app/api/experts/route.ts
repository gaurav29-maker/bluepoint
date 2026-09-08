import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { experts } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      slug: experts.slug,
      displayName: experts.displayName,
      initials: experts.initials,
      headline: experts.headline,
      bio: experts.bio,
      specialties: experts.specialties,
      yearsExperience: experts.yearsExperience,
      pricePaise: experts.pricePaise,
      sebiRegType: experts.sebiRegType,
      sebiRegNumber: experts.sebiRegNumber,
    })
    .from(experts)
    .where(eq(experts.status, "live"))
    .orderBy(asc(experts.pricePaise));

  return NextResponse.json({ experts: rows });
}
