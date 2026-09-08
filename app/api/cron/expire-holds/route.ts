import { NextRequest, NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { cronAuthorised } from "@/lib/cron";

export const dynamic = "force-dynamic";

/** Releases slots whose hold lapsed before payment landed. Runs every 5 minutes. */
export async function GET(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const expired = await db
    .update(bookings)
    .set({ status: "expired", cancelledReason: "hold expired before payment" })
    .where(and(eq(bookings.status, "held"), lt(bookings.holdExpiresAt, new Date())))
    .returning({ id: bookings.id });

  return NextResponse.json({ expired: expired.length });
}
