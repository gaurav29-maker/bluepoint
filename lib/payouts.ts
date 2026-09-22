import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, expertPayouts } from "@/lib/db/schema";
import { EXPERT_PAYOUT_PAISE } from "@/lib/constants";

/**
 * The expert payout ledger.
 *
 * Every function here is safe to call twice. Closing a session is reachable
 * from the expert console and from ops, and a booking can be completed once
 * from each before anybody notices — so "record a payout" has to mean "make
 * sure exactly one exists", not "insert one".
 *
 * The database backs that up rather than trusting this file:
 * expert_payouts_one_per_booking is a unique index, so a second insert is
 * refused even if two requests land in the same millisecond.
 */

/** What a session earns today. Read once, at the moment it is earned. */
export function rateForSession(): number {
  return EXPERT_PAYOUT_PAISE;
}

/**
 * Records what an expert is owed for a session that happened.
 *
 * Called when a booking reaches `completed` or `no_show`. A no-show still
 * earns: the refund policy says the customer is not refunded because the slot
 * was held and the intake was read, and the payout has to agree with that or
 * the two documents contradict each other.
 *
 * Returns the amount recorded, or null if there was nothing to record —
 * already recorded, booking not in a state that earns, or booking gone.
 * Never throws at the caller: closing a session must not fail because the
 * ledger had an opinion.
 */
export async function recordPayout(bookingId: string): Promise<number | null> {
  try {
    const [booking] = await db
      .select({ id: bookings.id, expertId: bookings.expertId, status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking) return null;
    if (booking.status !== "completed" && booking.status !== "no_show") return null;

    const amountPaise = rateForSession();

    const inserted = await db
      .insert(expertPayouts)
      .values({ expertId: booking.expertId, bookingId: booking.id, amountPaise })
      // Already there: leave it exactly as it is. Re-running must not change
      // an amount that was fixed when the session happened, nor revive one
      // that was voided by a refund.
      .onConflictDoNothing({ target: expertPayouts.bookingId })
      .returning({ id: expertPayouts.id });

    return inserted.length > 0 ? amountPaise : null;
  } catch (err) {
    console.error("[payouts] recordPayout failed", bookingId, err);
    return null;
  }
}

/**
 * Voids the payout for a refunded booking.
 *
 * Voided rather than deleted, because "this session earned nothing, and here
 * is why" is a different and more useful statement than silence. A payout
 * already marked paid is left alone — the money has gone, and pretending
 * otherwise would make the ledger disagree with the bank.
 */
export async function voidPayout(bookingId: string, note: string): Promise<void> {
  try {
    await db
      .update(expertPayouts)
      .set({ status: "void", note, updatedAt: new Date() })
      .where(and(eq(expertPayouts.bookingId, bookingId), eq(expertPayouts.status, "pending")));
  } catch (err) {
    console.error("[payouts] voidPayout failed", bookingId, err);
  }
}

export type PayoutTotals = { pendingPaise: number; paidPaise: number; sessions: number };

/** What one expert is owed and has been paid. */
export async function totalsForExpert(expertId: string): Promise<PayoutTotals> {
  const rows = await db
    .select({
      status: expertPayouts.status,
      total: sql<number>`coalesce(sum(${expertPayouts.amountPaise}), 0)::int`,
      n: sql<number>`count(*)::int`,
    })
    .from(expertPayouts)
    .where(and(eq(expertPayouts.expertId, expertId), inArray(expertPayouts.status, ["pending", "paid"])))
    .groupBy(expertPayouts.status);

  let pendingPaise = 0;
  let paidPaise = 0;
  let sessions = 0;
  for (const r of rows) {
    if (r.status === "pending") pendingPaise = r.total;
    if (r.status === "paid") paidPaise = r.total;
    sessions += r.n;
  }
  return { pendingPaise, paidPaise, sessions };
}
