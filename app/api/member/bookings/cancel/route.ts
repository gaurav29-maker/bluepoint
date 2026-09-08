import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, bundles, customers, experts, payments } from "@/lib/db/schema";
import { MEMBER_COOKIE, verifySession } from "@/lib/member-auth";
import { cancellationOutcome } from "@/lib/cancellation";
import { refundPayment } from "@/lib/razorpay";
import { sendRaw } from "@/lib/email";
import { istDateTime, rupees } from "@/lib/format";

export const dynamic = "force-dynamic";

const Body = z.object({ bookingId: z.string().uuid() });

/**
 * Lets a customer cancel their own session, on the terms /legal/refunds
 * actually promises. Until now that promise existed only on the policy page.
 */
export async function POST(req: NextRequest) {
  const customerId = await verifySession((await cookies()).get(MEMBER_COOKIE)?.value);
  if (!customerId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const [row] = await db
    .select({ booking: bookings, expert: experts, customer: customers })
    .from(bookings)
    .innerJoin(experts, eq(bookings.expertId, experts.id))
    .innerJoin(customers, eq(bookings.customerId, customers.id))
    .where(eq(bookings.id, parsed.data.bookingId))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  // Ownership is checked against the session, never against anything in the
  // request body.
  if (row.booking.customerId !== customerId) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (row.booking.status !== "confirmed") {
    return NextResponse.json({ error: "This session is not active" }, { status: 409 });
  }

  const outcome = cancellationOutcome(row.booking.startsAt);
  if (!outcome.allowed) {
    return NextResponse.json({ error: outcome.reason }, { status: 409 });
  }

  let refunded = 0;

  if (outcome.refund === "full") {
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.bookingId, row.booking.id), eq(payments.status, "captured")))
      .limit(1);

    // Money first, then the record — so a booking never claims to be refunded
    // when nothing moved.
    if (payment?.razorpayPaymentId) {
      await refundPayment(payment.razorpayPaymentId, payment.amountPaise, "cancelled by customer");
      await db.update(payments).set({ status: "refunded" }).where(eq(payments.id, payment.id));
      refunded = payment.amountPaise;
    }

    // A bundle call hands its credit back rather than any money.
    if (row.booking.bundleId && !payment) {
      const [bundle] = await db
        .select()
        .from(bundles)
        .where(eq(bundles.id, row.booking.bundleId))
        .limit(1);
      if (bundle && bundle.creditsUsed > 0) {
        await db
          .update(bundles)
          .set({ creditsUsed: bundle.creditsUsed - 1, status: "active" })
          .where(eq(bundles.id, bundle.id));
      }
    }
  }

  await db
    .update(bookings)
    .set({
      status: refunded > 0 ? "refunded" : "cancelled",
      cancelledReason: `cancelled by customer — ${outcome.refund}`,
    })
    .where(eq(bookings.id, row.booking.id));

  // The expert is holding that time; they need to know it is free.
  try {
    await sendRaw({
      to: row.expert.contactEmail,
      subject: `Cancelled: ${row.customer.name}, ${istDateTime(row.booking.startsAt)}`,
      html: `<p>${row.customer.name} has cancelled their session on
             <strong>${istDateTime(row.booking.startsAt)} IST</strong>. The slot is free again.</p>`,
    });
  } catch (err) {
    console.error("[cancel] expert notice failed", err);
  }

  return NextResponse.json({
    ok: true,
    refund: outcome.refund,
    refundedPaise: refunded,
    message:
      refunded > 0
        ? `${outcome.reason} ${rupees(refunded)} is on its way back and takes 5-7 working days.`
        : outcome.reason,
  });
}
