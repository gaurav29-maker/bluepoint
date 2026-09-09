import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, experts, intakeSubmissions } from "@/lib/db/schema";
import { signBookingToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

/** The booking id is a v4 uuid, and is the only thing guarding this. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [row] = await db
    .select({
      booking: bookings,
      expertName: experts.displayName,
      intakeId: intakeSubmissions.id,
    })
    .from(bookings)
    .innerJoin(experts, eq(bookings.expertId, experts.id))
    .leftJoin(intakeSubmissions, eq(intakeSubmissions.bookingId, bookings.id))
    .where(eq(bookings.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  return NextResponse.json({
    id: row.booking.id,
    status: row.booking.status,
    startsAt: row.booking.startsAt.toISOString(),
    amountPaise: row.booking.amountPaise,
    meetingUrl: row.booking.meetingUrl,
    expertName: row.expertName,
    expertNote: row.booking.expertNote,
    intakeDone: row.intakeId !== null,
    intakePath: `/booking/${row.booking.id}/intake?t=${signBookingToken(row.booking.id)}`,
  });
}
