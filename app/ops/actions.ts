"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, bundles, expertApplications, experts, payments } from "@/lib/db/schema";
import { OPS_COOKIE, sessionValid } from "@/lib/ops-auth";
import { refundPayment } from "@/lib/razorpay";
import { uniqueSlug } from "@/lib/slug";
import { SINGLE_CALL_PAISE } from "@/lib/constants";
import { expertSignInLink, sendRaw } from "@/lib/email";
import { mintExpertLink } from "@/lib/expert-auth";

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

/**
 * Approve an application: the moment an applicant becomes an expert.
 *
 * Deliberately conservative about what it creates. The new expert is `draft`,
 * not `live` — they have no availability yet, so publishing them immediately
 * would put a profile on the site whose every slot is empty. They go live from
 * the ops experts page once they have set their hours.
 *
 * The price is the standard rate rather than anything they asked for. What
 * someone puts in a form is a request; what a session costs is a decision,
 * and they can change it themselves afterwards.
 */
export async function approveApplication(formData: FormData) {
  await requireOps();
  const id = String(formData.get("applicationId"));

  const [application] = await db
    .select()
    .from(expertApplications)
    .where(and(eq(expertApplications.id, id), eq(expertApplications.status, "new")))
    .limit(1);

  // Already handled — two operators with the queue open, or a double submit.
  if (!application) {
    revalidatePath("/ops/applications");
    return;
  }

  const taken = await db.select({ slug: experts.slug }).from(experts);
  const slug = uniqueSlug(application.name, taken.map((e) => e.slug));

  const initials = application.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

  const [expert] = await db
    .insert(experts)
    .values({
      slug,
      displayName: application.name,
      initials: initials || "??",
      headline: application.headline,
      bio: application.bio,
      specialties: application.specialties,
      yearsExperience: application.yearsExperience,
      pricePaise: SINGLE_CALL_PAISE,
      sebiRegType: application.sebiRegType,
      sebiRegNumber: application.sebiRegNumber,
      contactEmail: application.email,
      status: "draft",
    })
    .returning();

  await db
    .update(expertApplications)
    .set({ status: "approved", reviewedAt: new Date(), expertId: expert.id })
    .where(eq(expertApplications.id, id));

  /*
   * The sign-in link is how they get in to set their hours. If the email
   * cannot go out the approval still stands — the expert row exists and ops
   * can resend — so this must not throw the whole action away.
   */
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const token = await mintExpertLink(expert.id);
    await sendRaw({
      to: expert.contactEmail,
      ...expertSignInLink({
        expertName: expert.displayName,
        url: `${base}/api/expert/session?token=${token}`,
      }),
    });
  } catch (err) {
    console.error(`[ops] approved ${expert.id} but could not send their sign-in link`, err);
  }

  revalidatePath("/ops/applications");
  revalidatePath("/ops/experts");
}

export async function rejectApplication(formData: FormData) {
  await requireOps();
  const id = String(formData.get("applicationId"));
  const note = String(formData.get("reviewNote") ?? "").trim();

  await db
    .update(expertApplications)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewNote: note === "" ? null : note,
    })
    .where(and(eq(expertApplications.id, id), eq(expertApplications.status, "new")));

  revalidatePath("/ops/applications");
}
