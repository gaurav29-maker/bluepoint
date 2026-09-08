import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  availabilityExceptions,
  availabilityRules,
  bookings,
  bundles,
  consents,
  customers,
  experts,
} from "@/lib/db/schema";
import { computeSlots, SLOT_MINUTES } from "@/lib/slots";
import { DISCLAIMER_VERSION } from "@/lib/constants";
import { occupiesSlot, releaseStaleHold } from "@/lib/bookings";
import { customerConfirmation, expertNotification, sendOnce } from "@/lib/email";

export const dynamic = "force-dynamic";

const Body = z.object({
  bundleId: z.string().uuid(),
  startsAt: z.string().datetime(),
  /** Stands in for a login: you must know the address the bundle was bought with. */
  email: z.string().email().max(200),
});

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/**
 * Spends one credit from an existing bundle. No payment — the money changed
 * hands when the bundle was bought.
 */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { bundleId, email } = parsed.data;
  const startsAt = new Date(parsed.data.startsAt);

  const [row] = await db
    .select({ bundle: bundles, expert: experts, customer: customers })
    .from(bundles)
    .innerJoin(experts, eq(bundles.expertId, experts.id))
    .innerJoin(customers, eq(bundles.customerId, customers.id))
    .where(eq(bundles.id, bundleId))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
  const { bundle, expert, customer } = row;

  if (customer.email.toLowerCase() !== email.trim().toLowerCase()) {
    return NextResponse.json({ error: "That email does not match this bundle" }, { status: 403 });
  }
  if (bundle.status !== "active") {
    return NextResponse.json({ error: "This bundle is no longer active" }, { status: 409 });
  }
  if (bundle.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "This bundle has expired" }, { status: 410 });
  }
  if (bundle.creditsUsed >= bundle.creditsTotal) {
    return NextResponse.json({ error: "All three calls have been used" }, { status: 409 });
  }

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
    booking = await db.transaction(async (tx) => {
      // Spend the credit with a guarded update rather than a read-then-write:
      // two tabs redeeming at once must not both succeed on the last credit.
      const spent = await tx
        .update(bundles)
        .set({ creditsUsed: sql`${bundles.creditsUsed} + 1` })
        .where(and(eq(bundles.id, bundle.id), sql`${bundles.creditsUsed} < ${bundles.creditsTotal}`))
        .returning({ creditsUsed: bundles.creditsUsed, creditsTotal: bundles.creditsTotal });

      if (spent.length === 0) throw new Error("NO_CREDITS");

      if (spent[0].creditsUsed >= spent[0].creditsTotal) {
        await tx.update(bundles).set({ status: "exhausted" }).where(eq(bundles.id, bundle.id));
      }

      const [b] = await tx
        .insert(bookings)
        .values({
          expertId: expert.id,
          customerId: customer.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + SLOT_MINUTES * 60_000),
          // Already paid for, so it is confirmed outright — there is no
          // payment step to wait on.
          status: "confirmed",
          product: "bundle_call",
          bundleId: bundle.id,
          amountPaise: 0,
          meetingUrl: expert.meetingUrl,
        })
        .returning();

      await tx.insert(consents).values({
        bookingId: b.id,
        disclaimerVersion: DISCLAIMER_VERSION,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: req.headers.get("user-agent") ?? null,
      });

      return b;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NO_CREDITS") {
      return NextResponse.json({ error: "All three calls have been used" }, { status: 409 });
    }
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "That slot was just taken" }, { status: 409 });
    }
    throw err;
  }

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
