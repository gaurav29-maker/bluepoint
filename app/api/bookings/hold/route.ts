import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  availabilityExceptions,
  availabilityRules,
  bookings,
  consents,
  customers,
  experts,
} from "@/lib/db/schema";
import { computeSlots, SLOT_MINUTES } from "@/lib/slots";
import { DISCLAIMER_VERSION, HOLD_MINUTES } from "@/lib/constants";
import { occupiesSlot, releaseStaleHold } from "@/lib/bookings";

export const dynamic = "force-dynamic";

const Body = z.object({
  expertSlug: z.string().min(1),
  startsAt: z.string().datetime(),
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(20).optional(),
  disclaimerAccepted: z.literal(true),
});

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", detail: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const startsAt = new Date(input.startsAt);

  const [expert] = await db
    .select()
    .from(experts)
    .where(and(eq(experts.slug, input.expertSlug), eq(experts.status, "live")))
    .limit(1);
  if (!expert) return NextResponse.json({ error: "Expert not found" }, { status: 404 });

  // Never trust the client that a slot is real. Recompute and check membership:
  // otherwise someone can book 3am, or a time the expert never offered.
  const horizonEnd = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const [rules, exceptions, taken] = await Promise.all([
    db.select().from(availabilityRules).where(eq(availabilityRules.expertId, expert.id)),
    db.select().from(availabilityExceptions).where(eq(availabilityExceptions.expertId, expert.id)),
    db
      .select({ startsAt: bookings.startsAt })
      .from(bookings)
      .where(
        and(
          eq(bookings.expertId, expert.id),
          occupiesSlot(),
          gte(bookings.startsAt, new Date()),
          lte(bookings.startsAt, horizonEnd),
        ),
      ),
  ]);

  const offered = computeSlots({
    timezone: expert.timezone,
    rules: rules.map((r) => ({ weekday: r.weekday, startMinute: r.startMinute, endMinute: r.endMinute })),
    exceptions: exceptions.map((e) => ({
      date: e.date,
      kind: e.kind,
      startMinute: e.startMinute,
      endMinute: e.endMinute,
    })),
    takenStarts: taken.map((b) => b.startsAt),
    from: new Date(),
    to: horizonEnd,
  });

  if (!offered.some((s) => s.startsAt.getTime() === startsAt.getTime())) {
    return NextResponse.json({ error: "That slot is no longer available" }, { status: 409 });
  }

  const email = input.email.trim();
  let [customer] = await db
    .select()
    .from(customers)
    .where(sql`lower(${customers.email}) = ${email.toLowerCase()}`)
    .limit(1);

  if (!customer) {
    try {
      [customer] = await db
        .insert(customers)
        .values({ email, name: input.name, phone: input.phone })
        .returning();
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      [customer] = await db
        .select()
        .from(customers)
        .where(sql`lower(${customers.email}) = ${email.toLowerCase()}`)
        .limit(1);
    }
  }

  // Clear a lapsed hold on this exact slot before inserting; the unique index
  // would otherwise refuse a slot nobody actually occupies.
  await releaseStaleHold(expert.id, startsAt);

  try {
    const [booking] = await db
      .insert(bookings)
      .values({
        expertId: expert.id,
        customerId: customer.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + SLOT_MINUTES * 60_000),
        status: "held",
        holdExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000),
        product: "single",
        amountPaise: expert.pricePaise, // server-side price, always
      })
      .returning();

    await db.insert(consents).values({
      bookingId: booking.id,
      disclaimerVersion: DISCLAIMER_VERSION,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });

    return NextResponse.json({
      bookingId: booking.id,
      holdExpiresAt: booking.holdExpiresAt?.toISOString(),
      amountPaise: booking.amountPaise,
    });
  } catch (err) {
    // Lost the race between computing slots and inserting. The partial unique
    // index is what actually decides who got the slot.
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "That slot was just taken" }, { status: 409 });
    }
    throw err;
  }
}
