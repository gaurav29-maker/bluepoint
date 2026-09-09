import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, intakeSubmissions } from "@/lib/db/schema";
import { cronAuthorised } from "@/lib/cron";
import { INTAKE_RETENTION_DAYS } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * DPDP retention: portfolio detail is deleted 90 days after the call.
 * The booking row survives; only the payload goes.
 *
 * The expert's note goes on the same clock. It describes the same
 * conversation as the intake it was written against — keeping "discussed the
 * concentration in IT" after deleting the holdings that sentence refers to
 * would be honouring the retention rule in letter and not in substance.
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const cutoff = new Date(Date.now() - INTAKE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const stale = await db
    .select({ id: intakeSubmissions.id })
    .from(intakeSubmissions)
    .innerJoin(bookings, eq(intakeSubmissions.bookingId, bookings.id))
    .where(and(isNull(intakeSubmissions.purgedAt), lt(bookings.endsAt, cutoff)));

  if (stale.length > 0) {
    await db
      .update(intakeSubmissions)
      .set({ payload: {}, purgedAt: new Date() })
      .where(inArray(intakeSubmissions.id, stale.map((s) => s.id)));
  }

  const notes = await db
    .update(bookings)
    .set({ expertNote: null, expertNoteAt: null })
    .where(and(isNotNull(bookings.expertNote), lt(bookings.endsAt, cutoff)))
    .returning({ id: bookings.id });

  return NextResponse.json({ purged: stale.length, notesPurged: notes.length });
}
