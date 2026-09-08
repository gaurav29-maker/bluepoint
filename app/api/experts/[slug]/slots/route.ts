import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { availabilityExceptions, availabilityRules, bookings, experts } from "@/lib/db/schema";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { computeSlots, DEFAULT_HORIZON_DAYS } from "@/lib/slots";

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

  const [rules, exceptions, taken] = await Promise.all([
    db.select().from(availabilityRules).where(eq(availabilityRules.expertId, expert.id)),
    db.select().from(availabilityExceptions).where(eq(availabilityExceptions.expertId, expert.id)),
    db
      .select({ startsAt: bookings.startsAt })
      .from(bookings)
      .where(
        and(
          eq(bookings.expertId, expert.id),
          inArray(bookings.status, ["held", "confirmed", "completed"]),
          gte(bookings.startsAt, from),
          lte(bookings.startsAt, to),
        ),
      ),
  ]);

  const slots = computeSlots({
    timezone: expert.timezone,
    rules: rules.map((r) => ({
      weekday: r.weekday,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
    })),
    exceptions: exceptions.map((e) => ({
      date: e.date,
      kind: e.kind,
      startMinute: e.startMinute,
      endMinute: e.endMinute,
    })),
    takenStarts: taken.map((b) => b.startsAt),
    from,
    to,
  });

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
