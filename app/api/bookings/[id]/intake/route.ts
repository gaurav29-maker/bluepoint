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
  if (booking.status !== "confirmed" && booking.status !== "completed") {
    return NextResponse.json({ error: "This booking is not active" }, { status: 409 });
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
