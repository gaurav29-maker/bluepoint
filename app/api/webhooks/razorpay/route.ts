import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, customers, experts, payments, webhookEvents } from "@/lib/db/schema";
import { refundPayment, verifyWebhookSignature } from "@/lib/razorpay";
import { customerConfirmation, expertNotification, refundApology, sendOnce } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/**
 * The only place a booking becomes confirmed.
 *
 * Razorpay's client-side success handler is a convenience, not evidence: it can
 * be lost on a flaky connection, or fabricated outright by anyone with the
 * browser console open.
 */
export async function POST(req: NextRequest) {
  // Raw body, not a parsed object — the signature is over these exact bytes.
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    console.warn("[razorpay] rejected webhook with bad signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const body = JSON.parse(raw) as {
    event: string;
    payload?: { payment?: { entity?: Record<string, unknown> } };
  };

  const eventId = req.headers.get("x-razorpay-event-id") ?? `${body.event}:${Date.now()}`;

  // Claim the event. A redelivery conflicts here and does nothing further.
  try {
    await db.insert(webhookEvents).values({
      provider: "razorpay",
      eventId,
      type: body.event,
      payload: body as unknown as Record<string, unknown>,
    });
  } catch (err) {
    if (isUniqueViolation(err)) return NextResponse.json({ ok: true, deduped: true });
    throw err;
  }

  try {
    if (body.event === "payment.captured") {
      await handleCapture(body.payload?.payment?.entity ?? {});
    }
    await markProcessed(eventId, null);
  } catch (err) {
    console.error("[razorpay] handler failed", err);
    await markProcessed(eventId, err instanceof Error ? err.message : String(err));
    // 500 asks Razorpay to redeliver. The claim row is already marked with the
    // error, and the unique index means a redelivery is safe to retry manually.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function markProcessed(eventId: string, error: string | null) {
  await db
    .update(webhookEvents)
    .set({ processedAt: new Date(), error })
    .where(and(eq(webhookEvents.provider, "razorpay"), eq(webhookEvents.eventId, eventId)));
}

async function handleCapture(entity: Record<string, unknown>) {
  const paymentId = String(entity.id ?? "");
  const orderId = String(entity.order_id ?? "");
  const amount = Number(entity.amount ?? 0);
  if (!paymentId || !orderId) throw new Error("capture payload missing ids");

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.razorpayOrderId, orderId))
    .limit(1);

  if (!payment || !payment.bookingId) {
    throw new Error(`no payment row for order ${orderId}`);
  }

  const [row] = await db
    .select({ booking: bookings, expert: experts, customer: customers })
    .from(bookings)
    .innerJoin(experts, eq(bookings.expertId, experts.id))
    .innerJoin(customers, eq(bookings.customerId, customers.id))
    .where(eq(bookings.id, payment.bookingId))
    .limit(1);

  if (!row) throw new Error(`no booking for payment ${paymentId}`);
  const { booking, expert, customer } = row;

  // Re-check the amount against what we recorded. A mismatch means something
  // is wrong upstream; confirm nothing.
  if (amount !== booking.amountPaise) {
    throw new Error(`amount mismatch: charged ${amount}, expected ${booking.amountPaise}`);
  }

  await db
    .update(payments)
    .set({ razorpayPaymentId: paymentId, status: "captured", raw: entity })
    .where(eq(payments.id, payment.id));

  if (booking.status === "confirmed" || booking.status === "completed") {
    return; // already handled
  }

  let confirmed = false;

  if (booking.status === "held" || booking.status === "expired") {
    try {
      // If the hold lapsed but nobody else took the slot, honour the payment —
      // refunding a slot that is still free would be gratuitous.
      const updated = await db
        .update(bookings)
        .set({ status: "confirmed", holdExpiresAt: null })
        .where(eq(bookings.id, booking.id))
        .returning({ id: bookings.id });
      confirmed = updated.length > 0;
    } catch (err) {
      // The partial unique index refused: someone else holds this slot now.
      if (!isUniqueViolation(err)) throw err;
      confirmed = false;
    }
  }

  if (confirmed) {
    const conf = customerConfirmation({
      customerName: customer.name,
      expertName: expert.displayName,
      startsAt: booking.startsAt,
      amountPaise: booking.amountPaise,
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
    return;
  }

  // Paid for a slot we cannot honour. Give the money back before doing anything
  // else — quietly keeping it is how a young marketplace dies.
  await refundPayment(paymentId, booking.amountPaise, "slot taken before payment landed");
  await db.update(payments).set({ status: "refunded" }).where(eq(payments.id, payment.id));
  await db
    .update(bookings)
    .set({ status: "refunded", cancelledReason: "slot taken before payment landed" })
    .where(eq(bookings.id, booking.id));

  const sorry = refundApology({
    customerName: customer.name,
    startsAt: booking.startsAt,
    amountPaise: booking.amountPaise,
  });
  await sendOnce(booking.id, "refund_apology", { to: customer.email, ...sorry });
}
