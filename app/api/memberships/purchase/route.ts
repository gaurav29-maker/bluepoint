import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, memberships, payments } from "@/lib/db/schema";
import { razorpay } from "@/lib/razorpay";
import { MEMBERSHIP_TIERS } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Buys a pass. No booking is involved — a pass is a window of time, and the
 * member books inside it afterwards from their console.
 *
 * The tier NAME crosses the wire, never the price. The amount is read from
 * MEMBERSHIP_TIERS on the server, so a two-lakh pass cannot be bought for one
 * rupee by editing the request.
 */
const Body = z.object({
  tier: z.enum(["quarterly", "annual"]),
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(20).optional(),
  disclaimerAccepted: z.literal(true),
});

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const input = parsed.data;
  const tier = MEMBERSHIP_TIERS[input.tier];

  const email = input.email.trim();
  let [customer] = await db
    .select()
    .from(customers)
    .where(sql`lower(${customers.email}) = ${email.toLowerCase()}`)
    .limit(1);

  if (!customer) {
    try {
      [customer] = await db
        .insert(customers)
        .values({ email, name: input.name, phone: input.phone })
        .returning();
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      [customer] = await db
        .select()
        .from(customers)
        .where(sql`lower(${customers.email}) = ${email.toLowerCase()}`)
        .limit(1);
    }
  }

  // The window is provisional until payment lands; the webhook sets the real
  // start so a pass never begins before it is paid for.
  const now = new Date();
  const [membership] = await db
    .insert(memberships)
    .values({
      customerId: customer.id,
      tier: input.tier,
      startsAt: now,
      endsAt: new Date(now.getTime() + tier.days * 24 * 60 * 60 * 1000),
      amountPaise: tier.pricePaise,
      status: "pending",
    })
    .returning();

  const order = await razorpay().orders.create({
    amount: tier.pricePaise,
    currency: "INR",
    receipt: membership.id,
    notes: { membershipId: membership.id, tier: input.tier },
  });

  await db.insert(payments).values({
    membershipId: membership.id,
    razorpayOrderId: order.id,
    amountPaise: tier.pricePaise,
    status: "created",
  });

  return NextResponse.json({
    membershipId: membership.id,
    orderId: order.id,
    amountPaise: tier.pricePaise,
    description: `${tier.label} — unlimited sessions for ${tier.days} days`,
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    prefill: { name: customer.name, email: customer.email, contact: customer.phone ?? "" },
  });
}
