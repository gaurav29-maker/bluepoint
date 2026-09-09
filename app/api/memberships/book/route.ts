import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { and, eq, gt, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  availabilityExceptions,
  availabilityRules,
  bookings,
  consents,
  customers,
  experts,
  memberships,
} from "@/lib/db/schema";
import { computeSlots, SLOT_MINUTES } from "@/lib/slots";
import { DISCLAIMER_VERSION } from "@/lib/constants";
import { occupiesSlot, releaseStaleHold } from "@/lib/bookings";
import { MEMBER_COOKIE, verifySession } from "@/lib/member-auth";
import { customerConfirmation, expertNotification, sendOnce } from "@/lib/email";

export const dynamic = "force-dynamic";

const Body = z.object({
  expertSlug: z.string().min(1),
  startsAt: z.string().datetime(),
});

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/**
 * Books a session against an active pass. No payment, no credit: the pass is
 * a window of time, and this slot falls inside it.
 *
 * Identity comes from the signed member cookie, never from an email in the
 * body — otherwise knowing a member's address would be enough to spend their
 * membership.
 */
export async function POST(req: NextRequest) {
  const customerId = await verifySession((await cookies()).get(MEMBER_COOKIE)?.value);
  if (!customerId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(startsAt.getTime() + SLOT_MINUTES * 60_000);

  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // The pass must still be live when the session actually happens, not merely
  // when it is booked — otherwise a member books a year ahead on the last day.
  const [membership] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.customerId, customerId),
        eq(memberships.status, "active"),
        gt(memberships.endsAt, endsAt),
      ),
    )
    .limit(1);

  if (!membership) {
    return NextResponse.json(
      { error: "You have no active pass covering that date" },
      { status: 403 },
    );
  }

  const [expert] = await db
    .select()
    .from(experts)
    .where(and(eq(experts.slug, parsed.data.expertSlug), eq(experts.status, "live")))
    .limit(1);
  if (!expert) return NextResponse.json({ error: "Expert not found" }, { status: 404 });

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

  await releaseStaleHold(expert.id, startsAt);

  let booking;
  try {
    [booking] = await db
      .insert(bookings)
      .values({
        expertId: expert.id,
        customerId: customer.id,
        startsAt,
        endsAt,
        // Nothing to pay, so nothing to wait for.
        status: "confirmed",
        product: "membership_call",
        membershipId: membership.id,
        amountPaise: 0,
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "That slot was just taken" }, { status: 409 });
    }
    throw err;
  }

  await db.insert(consents).values({
    bookingId: booking.id,
    disclaimerVersion: DISCLAIMER_VERSION,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  const conf = customerConfirmation({
    customerName: customer.name,
    expertName: expert.displayName,
    startsAt: booking.startsAt,
    amountPaise: 0,
    bookingId: booking.id,
    meetingUrl: booking.meetingUrl,
  });
  await sendOnce(booking.id, "booking_confirmed_customer", { to: customer.email, ...conf });

  const note = expertNotification({
    expertName: expert.displayName,
    customerName: customer.name,
    startsAt: booking.startsAt,
    bookingId: booking.id,
  });
  await sendOnce(booking.id, "booking_confirmed_expert", { to: expert.contactEmail, ...note });

  return NextResponse.json({ bookingId: booking.id });
}
