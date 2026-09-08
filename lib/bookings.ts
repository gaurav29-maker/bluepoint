import { and, eq, gt, inArray, isNull, lt, ne, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema";

/**
 * Which bookings actually occupy a slot right now.
 *
 * A row sitting in 'held' past its expiry occupies nothing — the customer
 * walked away from checkout. Treating it as free here is what makes hold
 * expiry independent of any scheduled job: Vercel's Hobby plan will not run a
 * cron more than once a day, and correctness must not wait on one.
 */
export function occupiesSlot(now: Date = new Date()): SQL | undefined {
  return and(
    inArray(bookings.status, ["held", "confirmed", "completed"]),
    or(ne(bookings.status, "held"), gt(bookings.holdExpiresAt, now)),
  );
}

/**
 * Release a lapsed hold on one exact slot so the unique index will accept a
 * new booking for it.
 *
 * The index cannot express "held and not yet expired" — its predicate has to
 * be immutable — so the stale row is cleared out of the way first.
 */
export async function releaseStaleHold(expertId: string, startsAt: Date): Promise<void> {
  await db
    .update(bookings)
    .set({ status: "expired", cancelledReason: "hold expired before payment" })
    .where(
      and(
        eq(bookings.expertId, expertId),
        eq(bookings.startsAt, startsAt),
        eq(bookings.status, "held"),
        or(isNull(bookings.holdExpiresAt), lt(bookings.holdExpiresAt, new Date())),
      ),
    );
}
