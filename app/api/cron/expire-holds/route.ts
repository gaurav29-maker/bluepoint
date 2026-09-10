import { NextRequest, NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { cronAuthorised } from "@/lib/cron";

export const dynamic = "force-dynamic";

/**
 * Releases slots whose hold lapsed before payment landed.
 *
 * Runs once a day, not every five minutes as this said until now. Vercel's
 * Hobby plan allows one cron run per day, which is why releasing a slot does
 * not depend on this job at all: `releaseStaleHold` frees a lapsed hold the
 * moment somebody tries to book that time, and the availability calculation
 * ignores holds that have expired. This is the tidy-up that marks the rows,
 * not the mechanism that frees the slot — and the difference matters, because
 * the old comment implied a customer might wait five minutes for a slot that
 * is in fact already bookable.
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const expired = await db
    .update(bookings)
    .set({ status: "expired", cancelledReason: "hold expired before payment" })
    .where(and(eq(bookings.status, "held"), lt(bookings.holdExpiresAt, new Date())))
    .returning({ id: bookings.id });

  return NextResponse.json({ expired: expired.length });
}
