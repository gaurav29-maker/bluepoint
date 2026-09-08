"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, bundles, experts, payments } from "@/lib/db/schema";
import { OPS_COOKIE, sessionValid } from "@/lib/ops-auth";
import { refundPayment } from "@/lib/razorpay";

/**
 * Server actions are POST endpoints in their own right, so the middleware guard
 * in front of /ops is not sufficient on its own. Every action re-checks.
 */
async function requireOps() {
  const token = (await cookies()).get(OPS_COOKIE)?.value;
  if (!(await sessionValid(token))) throw new Error("Not signed in");
}

export async function signOut() {
  (await cookies()).delete(OPS_COOKIE);
  redirect("/ops/login");
}

export async function markComplete(formData: FormData) {
  await requireOps();
  const id = String(formData.get("bookingId"));

  await db
    .update(bookings)
    .set({ status: "completed" })
    .where(and(eq(bookings.id, id), eq(bookings.status, "confirmed")));

  revalidatePath(`/ops/bookings/${id}`);
  revalidatePath("/ops/bookings");
  revalidatePath("/ops");
}

export async function cancelBooking(formData: FormData) {
  await requireOps();
  const id = String(formData.get("bookingId"));
  const reason = String(formData.get("reason") ?? "").trim() || "cancelled from ops console";

  await db
    .update(bookings)
    .set({ status: "cancelled", cancelledReason: reason, holdExpiresAt: null })
    .where(eq(bookings.id, id));

  revalidatePath(`/ops/bookings/${id}`);
  revalidatePath("/ops/bookings");
  revalidatePath("/ops");
}

/**
 * Refunds the money and then marks the booking. If Razorpay refuses, nothing
 * is marked — a booking that says "refunded" when no money moved is worse than
 * an error message.
 */
export async function refundBooking(formData: FormData) {
  await requireOps();
  const id = String(formData.get("bookingId"));
  const reason = String(formData.get("reason") ?? "").trim() || "refunded from ops console";

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  if (!booking) throw new Error("Booking not found");

  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, id), eq(payments.status, "captured")))
    .limit(1);

  if (!payment?.razorpayPaymentId) {
    throw new Error("No captured payment on this booking — cancel it instead");
  }

  await refundPayment(payment.razorpayPaymentId, payment.amountPaise, reason);

  await db.update(payments).set({ status: "refunded" }).where(eq(payments.id, payment.id));
  await db
    .update(bookings)
    .set({ status: "refunded", cancelledReason: reason })
    .where(eq(bookings.id, id));

  // A refunded bundle is spent, not returned to the customer's credits.
  if (booking.bundleId) {
    await db.update(bundles).set({ status: "refunded" }).where(eq(bundles.id, booking.bundleId));
  }

  revalidatePath(`/ops/bookings/${id}`);
  revalidatePath("/ops/bookings");
  revalidatePath("/ops");
}

export async function setExpertStatus(formData: FormData) {
  await requireOps();
  const id = String(formData.get("expertId"));
  const status = String(formData.get("status"));
  if (status !== "live" && status !== "paused" && status !== "draft") {
    throw new Error("Unknown status");
  }

  await db.update(experts).set({ status, updatedAt: new Date() }).where(eq(experts.id, id));

  revalidatePath("/ops/experts");
  revalidatePath("/");
}

export async function setExpertPrice(formData: FormData) {
  await requireOps();
  const id = String(formData.get("expertId"));
  const rupees = Number(formData.get("rupees"));

  if (!Number.isFinite(rupees) || rupees < 0 || rupees > 200000) {
    throw new Error("Price must be between 0 and 2,00,000 rupees");
  }

  await db
    .update(experts)
    .set({ pricePaise: Math.round(rupees * 100), updatedAt: new Date() })
    .where(eq(experts.id, id));

  revalidatePath("/ops/experts");
  revalidatePath("/");
}
