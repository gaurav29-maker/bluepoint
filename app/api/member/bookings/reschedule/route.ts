import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  availabilityExceptions,
  availabilityRules,
  bookings,
  customers,
  experts,
} from "@/lib/db/schema";
import { MEMBER_COOKIE, verifySession } from "@/lib/member-auth";
import { canReschedule } from "@/lib/cancellation";
import { computeSlots, SLOT_MINUTES } from "@/lib/slots";
import { occupiesSlot, releaseStaleHold } from "@/lib/bookings";
import { sendRaw } from "@/lib/email";
import { istDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const Body = z.object({
  bookingId: z.string().uuid(),
  startsAt: z.string().datetime(),
});

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/**
 * Moves a session to another open slot with the same expert. Free, once, and
 * only outside the 24-hour window — the terms /legal/refunds sets out.
 *
 * The booking row is updated rather than cancelled and recreated, so the
 * intake form, consent record and payment stay attached to it.
 */
export async function POST(req: NextRequest) {
  const customerId = await verifySession((await cookies()).get(MEMBER_COOKIE)?.value);
  if (!customerId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const startsAt = new Date(parsed.data.startsAt);

  const [row] = await db
    .select({ booking: bookings, expert: experts, customer: customers })
    .from(bookings)
    .innerJoin(experts, eq(bookings.expertId, experts.id))
    .innerJoin(customers, eq(bookings.customerId, customers.id))
    .where(eq(bookings.id, parsed.data.bookingId))
    .limit(1);

  if (!row || row.booking.customerId !== customerId) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (row.booking.status !== "confirmed") {
    return NextResponse.json({ error: "This session is not active" }, { status: 409 });
  }

  const check = canReschedule(row.booking.startsAt, row.booking.rescheduleCount);
  if (!check.allowed) return NextResponse.json({ error: check.reason }, { status: 409 });

  const { expert, customer, booking } = row;
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
          // Its own current slot must not count as taken, or it can never move.
          sql`${bookings.id} <> ${booking.id}`,
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

  await releaseStaleHold(expert.id, startsAt);

  const previous = booking.startsAt;

  try {
    await db
      .update(bookings)
      .set({
        startsAt,
        endsAt: new Date(startsAt.getTime() + SLOT_MINUTES * 60_000),
        rescheduleCount: booking.rescheduleCount + 1,
      })
      .where(eq(bookings.id, booking.id));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "That slot was just taken" }, { status: 409 });
    }
    throw err;
  }

  try {
    await sendRaw({
      to: expert.contactEmail,
      subject: `Moved: ${customer.name} is now ${istDateTime(startsAt)}`,
      html: `<p>${customer.name} has moved their session.</p>
             <p>Was <strong>${istDateTime(previous)} IST</strong><br>
             Now <strong>${istDateTime(startsAt)} IST</strong></p>`,
    });
    await sendRaw({
      to: customer.email,
      subject: `Your session has moved to ${istDateTime(startsAt)}`,
      html: `<p>Hi ${customer.name}, your session with <strong>${expert.displayName}</strong> is now
             <strong>${istDateTime(startsAt)} IST</strong>.</p>
             <p>This was your one free move, so this time is now fixed. If you cannot make it,
             cancel from your console instead.</p>`,
    });
  } catch (err) {
    console.error("[reschedule] notice failed", err);
  }

  return NextResponse.json({ ok: true, startsAt: startsAt.toISOString() });
}
