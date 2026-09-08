import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, bundles, customers, experts, payments } from "@/lib/db/schema";
import { razorpay } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

/**
 * Takes a booking id and nothing else.
 *
 * No price, no plan, no discount code from the browser. Accepting a
 * client-supplied amount is how a 2,200 rupee slot gets bought for one rupee.
 * Whether this is a single call or a three-call bundle is decided here, from
 * the booking's own product type.
 */
const Body = z.object({ bookingId: z.string().uuid() });

export async function POST(req: NextRequest) {
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

  const { booking, expert, customer } = row;

  if (booking.status !== "held") {
    return NextResponse.json({ error: "This booking is no longer awaiting payment" }, { status: 409 });
  }
  if (booking.holdExpiresAt && booking.holdExpiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Your hold on this slot expired" }, { status: 410 });
  }

  // A bundle call is paid for once, at the bundle's price, covering three calls.
  let bundle: typeof bundles.$inferSelect | null = null;
  if (booking.bundleId) {
    const [b] = await db.select().from(bundles).where(eq(bundles.id, booking.bundleId)).limit(1);
    bundle = b ?? null;
  }

  const amountPaise = bundle ? bundle.amountPaise : booking.amountPaise;
  const description = bundle
    ? `3-call bundle with ${expert.displayName}`
    : `Session with ${expert.displayName}`;

  // Reuse the order if one already exists — a customer who refreshes checkout
  // should not generate a second order against the same booking.
  const [existing] = await db
    .select()
    .from(payments)
    .where(eq(payments.bookingId, booking.id))
    .limit(1);

  let orderId = existing?.razorpayOrderId;

  if (!orderId) {
    const order = await razorpay().orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: booking.id,
      notes: {
        bookingId: booking.id,
        expert: expert.slug,
        product: bundle ? "bundle" : "single",
      },
    });
    orderId = order.id;
    await db.insert(payments).values({
      bookingId: booking.id,
      bundleId: bundle?.id ?? null,
      razorpayOrderId: order.id,
      amountPaise,
      status: "created",
    });
  }

  return NextResponse.json({
    orderId,
    amountPaise,
    description,
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    expertName: expert.displayName,
    prefill: { name: customer.name, email: customer.email, contact: customer.phone ?? "" },
  });
}
