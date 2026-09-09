"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { availabilityRules, bookings, experts } from "@/lib/db/schema";
import { EXPERT_COOKIE, verifyExpertSession } from "@/lib/expert-auth";

/**
 * Server actions are POST endpoints in their own right, so each one re-checks
 * the session — and every one is scoped to the signed-in expert's OWN rows.
 * An expert must never be able to touch another's schedule by id.
 */
async function requireExpert(): Promise<string> {
  const id = await verifyExpertSession((await cookies()).get(EXPERT_COOKIE)?.value);
  if (!id) throw new Error("Not signed in");
  return id;
}

export async function signOutExpert() {
  (await cookies()).delete(EXPERT_COOKIE);
}

/** The link for ONE session. Never the expert's own room — see schema. */
export async function setMeetingLink(formData: FormData) {
  const expertId = await requireExpert();
  const bookingId = String(formData.get("bookingId"));
  const raw = String(formData.get("meetingUrl") ?? "").trim();

  if (raw !== "" && !/^https:\/\/\S+$/i.test(raw)) {
    throw new Error("A join link must be an https address");
  }

  await db
    .update(bookings)
    .set({ meetingUrl: raw === "" ? null : raw })
    .where(and(eq(bookings.id, bookingId), eq(bookings.expertId, expertId)));

  revalidatePath("/expert");
}

/** Notes are shown to the customer, so there is a limit on what fits. */
const NOTE_MAX = 900;

/**
 * What the expert recorded about the session.
 *
 * Kept separate from marking a session complete so it can be written
 * afterwards, corrected, or added to a session closed weeks ago — an expert
 * finishing four calls in an afternoon should not have to choose between
 * writing something useful and clearing the queue.
 */
export async function saveSessionNote(formData: FormData) {
  const expertId = await requireExpert();
  const bookingId = String(formData.get("bookingId"));
  const note = String(formData.get("note") ?? "").trim();

  if (note.length > NOTE_MAX) {
    throw new Error(`Keep the note under ${NOTE_MAX} characters`);
  }

  await db
    .update(bookings)
    .set({
      expertNote: note === "" ? null : note,
      expertNoteAt: note === "" ? null : new Date(),
    })
    .where(and(eq(bookings.id, bookingId), eq(bookings.expertId, expertId)));

  revalidatePath("/expert");
}

export async function markCompleted(formData: FormData) {
  const expertId = await requireExpert();
  const bookingId = String(formData.get("bookingId"));

  await db
    .update(bookings)
    .set({ status: "completed" })
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.expertId, expertId),
        eq(bookings.status, "confirmed"),
      ),
    );

  revalidatePath("/expert");
}

/**
 * A no-show is not a cancellation. Nobody withdrew — the time was held and
 * burned — and the refund policy treats the two differently, so the record
 * has to keep them apart rather than collapsing both into "cancelled".
 */
export async function markNoShow(formData: FormData) {
  const expertId = await requireExpert();
  const bookingId = String(formData.get("bookingId"));

  await db
    .update(bookings)
    .set({ status: "no_show", cancelledReason: "customer did not attend" })
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.expertId, expertId),
        eq(bookings.status, "confirmed"),
      ),
    );

  revalidatePath("/expert");
}

export async function addAvailability(formData: FormData) {
  const expertId = await requireExpert();
  const weekday = Number(formData.get("weekday"));
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");

  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
  };

  const startMinute = toMinutes(from);
  const endMinute = toMinutes(to);

  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error("Pick a day");
  if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute)) throw new Error("Pick times");
  // A window shorter than one session can never produce a bookable slot, so
  // it would silently do nothing.
  if (endMinute - startMinute < 45) throw new Error("A window must be at least 45 minutes");

  await db.insert(availabilityRules).values({ expertId, weekday, startMinute, endMinute });
  revalidatePath("/expert/availability");
  revalidatePath("/expert");
}

export async function removeAvailability(formData: FormData) {
  const expertId = await requireExpert();
  const ruleId = String(formData.get("ruleId"));

  await db
    .delete(availabilityRules)
    .where(and(eq(availabilityRules.id, ruleId), eq(availabilityRules.expertId, expertId)));

  revalidatePath("/expert/availability");
  revalidatePath("/expert");
}

/*
 * What an expert may change about themselves, and what they may not.
 *
 * Rate and words: yes. /apply promises "you set your own rate and hours",
 * and a promise the software does not keep is worse than one never made.
 * Changing the rate is safe for anyone already booked because a booking
 * captures amount_paise when it is held, never at the time of the call.
 *
 * SEBI registration: no. The whole value of that line on a profile page is
 * that a person checked it against the register before the expert went live.
 * If an expert could edit it afterwards, the check would verify nothing. It
 * stays with ops.
 *
 * Going live: no. An expert can pause and unpause themselves — the apply page
 * says pausing takes one click — but draft to live stays a deliberate
 * decision by whoever did the verifying.
 */
const PRICE_MIN_PAISE = 50_000;
const PRICE_MAX_PAISE = 5_000_000;

export async function updateExpertProfile(formData: FormData) {
  const expertId = await requireExpert();

  const headline = String(formData.get("headline") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const rupees = Number(formData.get("priceRupees"));

  if (headline.length < 6 || headline.length > 90) {
    throw new Error("A headline needs to be between 6 and 90 characters");
  }
  if (bio.length < 40 || bio.length > 1200) {
    throw new Error("A description needs to be between 40 and 1200 characters");
  }
  if (!Number.isFinite(rupees)) throw new Error("Enter your rate in rupees");

  const pricePaise = Math.round(rupees * 100);
  if (pricePaise < PRICE_MIN_PAISE || pricePaise > PRICE_MAX_PAISE) {
    throw new Error(
      `A session rate has to be between ₹${PRICE_MIN_PAISE / 100} and ₹${PRICE_MAX_PAISE / 100}`,
    );
  }

  await db
    .update(experts)
    .set({ headline, bio, pricePaise, updatedAt: new Date() })
    .where(eq(experts.id, expertId));

  revalidatePath("/expert/profile");
  revalidatePath("/");
}

/** Pausing hides them from the site at once. Booked calls are untouched. */
export async function setOwnPaused(formData: FormData) {
  const expertId = await requireExpert();
  const paused = String(formData.get("paused")) === "true";

  const [me] = await db.select().from(experts).where(eq(experts.id, expertId)).limit(1);
  if (!me) throw new Error("Not signed in");
  // A draft expert has never been published, so there is nothing to pause and
  // un-pausing must not become a way to publish yourself.
  if (me.status === "draft") throw new Error("Your profile has not been published yet");

  await db
    .update(experts)
    .set({ status: paused ? "paused" : "live", updatedAt: new Date() })
    .where(and(eq(experts.id, expertId), inArray(experts.status, ["live", "paused"])));

  revalidatePath("/expert/profile");
  revalidatePath("/");
}
