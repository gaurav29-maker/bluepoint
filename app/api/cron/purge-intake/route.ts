import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, intakeSubmissions } from "@/lib/db/schema";
import { cronAuthorised } from "@/lib/cron";
import { INTAKE_RETENTION_DAYS } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * DPDP retention: portfolio detail is deleted 90 days after the call.
 * The booking row survives; only the payload goes.
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const cutoff = new Date(Date.now() - INTAKE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const stale = await db
    .select({ id: intakeSubmissions.id })
    .from(intakeSubmissions)
    .innerJoin(bookings, eq(intakeSubmissions.bookingId, bookings.id))
    .where(and(isNull(intakeSubmissions.purgedAt), lt(bookings.endsAt, cutoff)));

  if (stale.length === 0) return NextResponse.json({ purged: 0 });

  await db
    .update(intakeSubmissions)
    .set({ payload: {}, purgedAt: new Date() })
    .where(inArray(intakeSubmissions.id, stale.map((s) => s.id)));

  return NextResponse.json({ purged: stale.length });
}
