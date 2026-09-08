import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { verifyEmailChange } from "@/lib/member-auth";
import { sendRaw } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Applies an email change, once the new address has proved it can receive mail.
 *
 * No session is required: following the link IS the proof, and the token is
 * signed over both the customer and the exact new address, so it cannot be
 * pointed at a different one.
 */
export async function GET(req: NextRequest) {
  const base = req.nextUrl.origin;
  const claim = await verifyEmailChange(req.nextUrl.searchParams.get("t"));

  if (!claim) {
    return NextResponse.redirect(`${base}/member/profile?error=email`);
  }

  const [me] = await db.select().from(customers).where(eq(customers.id, claim.customerId)).limit(1);
  if (!me) return NextResponse.redirect(`${base}/member/login`);

  // Re-checked here because someone else may have taken the address in the
  // thirty minutes since the link was sent.
  const [clash] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(sql`lower(${customers.email}) = ${claim.email}`, ne(customers.id, claim.customerId)))
    .limit(1);

  if (clash) return NextResponse.redirect(`${base}/member/profile?error=taken`);

  const previous = me.email;
  await db
    .update(customers)
    .set({ email: claim.email })
    .where(eq(customers.id, claim.customerId));

  // The old address is told, so losing control of an account is noticed by the
  // person losing it rather than only by the person taking it.
  try {
    await sendRaw({
      to: previous,
      subject: "Your Bluepoint email address was changed",
      html: `<p>Hi ${me.name}, the email on your Bluepoint account was changed from
             <strong>${previous}</strong> to <strong>${claim.email}</strong>.</p>
             <p>If that was not you, reply to this message immediately.</p>`,
    });
  } catch (err) {
    console.error("[profile] old-address notice failed", err);
  }

  return NextResponse.redirect(`${base}/member/profile?changed=1`);
}
