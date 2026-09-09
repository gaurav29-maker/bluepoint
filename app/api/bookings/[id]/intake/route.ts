import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, intakeSubmissions } from "@/lib/db/schema";
import { verifyBookingToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

/**
 * Note what cannot be submitted: there is no field for a broker or demat
 * login, here or in the schema. The FAQ promises users never share one.
 */
const Body = z.object({
  token: z.string().min(1),
  /**
   * Rows, so two intakes can be compared. The prose below is kept as well —
   * a percentage cannot say "I keep averaging down on this one", and that is
   * often the sentence the expert actually needs.
   */
  holdings: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        pct: z.coerce.number().min(0).max(100),
      }),
    )
    .max(20)
    .optional()
    .default([]),
  holdingsSummary: z.string().min(1).max(5000),
  goals: z.string().max(2000).optional().default(""),
  experienceYears: z.coerce.number().int().min(0).max(80).optional(),
  riskComfort: z.enum(["low", "medium", "high"]).optional(),
  tradesFno: z.boolean().optional().default(false),
  questions: z.string().max(2000).optional().default(""),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const { token, ...payload } = parsed.data;
  if (!verifyBookingToken(id, token)) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
  }

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (booking.status !== "confirmed") {
    return NextResponse.json({ error: "This booking is not active" }, { status: 409 });
  }

  /*
   * The link has no expiry of its own — it is an HMAC of the booking id, and
   * phases 1-2 have no customer accounts to check instead. The booking is
   * what expires it.
   *
   * Without this a forwarded email stayed live forever, and the damage was
   * not merely a pointless late submission: the 90-day purge blanks the
   * payload and stamps purged_at, and an upsert afterwards wrote a fresh
   * payload while purged_at stayed set. The row then held portfolio detail
   * that retention had deleted, and the expert console — which treats
   * purged_at as authoritative — reported it as gone. Deleted data,
   * resurrected and invisible.
   */
  if (booking.endsAt.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "This session has already happened, so the form is closed." },
      { status: 409 },
    );
  }

  const [existing] = await db
    .select({ purgedAt: intakeSubmissions.purgedAt })
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.bookingId, id))
    .limit(1);

  // Belt and braces: never write over a row retention has already cleared.
  if (existing?.purgedAt) {
    return NextResponse.json({ error: "This form is no longer open." }, { status: 409 });
  }

  await db
    .insert(intakeSubmissions)
    .values({ bookingId: id, payload })
    .onConflictDoUpdate({
      target: intakeSubmissions.bookingId,
      set: { payload, submittedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
}
