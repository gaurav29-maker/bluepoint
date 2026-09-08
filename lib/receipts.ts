import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, bundles, experts, memberships, payments } from "@/lib/db/schema";
import { MEMBERSHIP_TIERS } from "@/lib/constants";

export type Receipt = {
  id: string;
  reference: string;
  paidAt: Date;
  amountPaise: number;
  status: "created" | "captured" | "failed" | "refunded";
  description: string;
  razorpayPaymentId: string | null;
  razorpayOrderId: string;
};

/**
 * A human-quotable reference, not an invoice number.
 *
 * GST invoice numbers must be sequential and unbroken across a financial year,
 * which a value derived from a random id can never be. When the entity and
 * GSTIN exist, invoices need their own counter — this stays a receipt.
 */
export function receiptReference(paymentId: string): string {
  return `BP-${paymentId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export async function receiptsForCustomer(customerId: string): Promise<Receipt[]> {
  const [ownBookings, ownMemberships] = await Promise.all([
    db.select({ id: bookings.id }).from(bookings).where(eq(bookings.customerId, customerId)),
    db.select({ id: memberships.id }).from(memberships).where(eq(memberships.customerId, customerId)),
  ]);

  const bookingIds = ownBookings.map((b) => b.id);
  const membershipIds = ownMemberships.map((m) => m.id);
  if (bookingIds.length === 0 && membershipIds.length === 0) return [];

  const clauses = [];
  if (bookingIds.length) clauses.push(inArray(payments.bookingId, bookingIds));
  if (membershipIds.length) clauses.push(inArray(payments.membershipId, membershipIds));

  const rows = await db
    .select({
      payment: payments,
      expertName: experts.displayName,
      bookingStartsAt: bookings.startsAt,
      bundleCredits: bundles.creditsTotal,
      tier: memberships.tier,
    })
    .from(payments)
    .leftJoin(bookings, eq(payments.bookingId, bookings.id))
    .leftJoin(experts, eq(bookings.expertId, experts.id))
    .leftJoin(bundles, eq(payments.bundleId, bundles.id))
    .leftJoin(memberships, eq(payments.membershipId, memberships.id))
    .where(and(or(...clauses)))
    .orderBy(desc(payments.createdAt));

  return rows
    // A created-but-never-paid order is not a receipt of anything.
    .filter((r) => r.payment.status === "captured" || r.payment.status === "refunded")
    .map((r) => ({
      id: r.payment.id,
      reference: receiptReference(r.payment.id),
      paidAt: r.payment.createdAt,
      amountPaise: r.payment.amountPaise,
      status: r.payment.status,
      razorpayPaymentId: r.payment.razorpayPaymentId,
      razorpayOrderId: r.payment.razorpayOrderId,
      description: describe(r),
    }));
}

function describe(r: {
  tier: "quarterly" | "annual" | null;
  bundleCredits: number | null;
  expertName: string | null;
}): string {
  if (r.tier) return `${MEMBERSHIP_TIERS[r.tier].label} — unlimited sessions`;
  if (r.bundleCredits) {
    return r.expertName
      ? `${r.bundleCredits}-call bundle with ${r.expertName}`
      : `${r.bundleCredits}-call bundle`;
  }
  return r.expertName ? `Session with ${r.expertName}` : "Session";
}

export async function receiptForCustomer(
  customerId: string,
  paymentId: string,
): Promise<Receipt | null> {
  const all = await receiptsForCustomer(customerId);
  return all.find((r) => r.id === paymentId) ?? null;
}
