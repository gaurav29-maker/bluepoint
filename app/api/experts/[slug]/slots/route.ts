import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { experts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { DEFAULT_HORIZON_DAYS } from "@/lib/slots";
import { openSlotsFor } from "@/lib/availability";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const [expert] = await db
    .select()
    .from(experts)
    .where(and(eq(experts.slug, slug), eq(experts.status, "live")))
    .limit(1);

  if (!expert) return NextResponse.json({ error: "Expert not found" }, { status: 404 });

  const days = Math.min(Number(req.nextUrl.searchParams.get("days") ?? DEFAULT_HORIZON_DAYS), 60);
  const from = new Date();
  const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

  const slots = await openSlotsFor(expert, from, to);

  return NextResponse.json({
    expert: {
      slug: expert.slug,
      displayName: expert.displayName,
      pricePaise: expert.pricePaise,
      timezone: expert.timezone,
    },
    slots: slots.map((s) => ({ startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() })),
  });
}
