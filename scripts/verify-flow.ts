import { loadEnv } from "./load-env";
loadEnv();

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, eq, gt, gte, inArray, sql } from "drizzle-orm";
import { db } from "../lib/db";
import {
  bookings,
  bundles,
  customers,
  expertApplications,
  experts,
  intakeSubmissions,
  memberships,
  payments,
  webhookEvents,
} from "../lib/db/schema";
import { MEMBERSHIP_TIERS, SINGLE_CALL_PAISE } from "../lib/constants";
import { openSlotsFor, openSlotsForMany } from "../lib/availability";
import { runtimeConnection } from "../lib/db/connection";
import { verifyBookingToken } from "../lib/tokens";

/**
 * Exercises the parts of the booking flow that need no Razorpay and no Resend.
 *
 * Everything here was written months of commits ago and had never once run.
 * The double-booking race in particular is the failure that would cost a
 * customer and an expert at once, and it is defended by a partial unique index
 * rather than by application code — which is exactly the kind of claim that
 * deserves to be executed rather than believed.
 *
 *   npm run db:local     (in another terminal)
 *   npm run dev          (in another terminal)
 *   npm run verify
 */

const BASE = process.env.VERIFY_BASE ?? "http://localhost:3000";
const EXPERT = "rhea-kulkarni";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/**
 * Change a hex signature by exactly one character, guaranteed.
 *
 * The first version of this was `.replace(/.$/, "0")`, which does nothing at
 * all when the signature already ends in "0" — so one run in sixteen sent a
 * VALID signature and then reported that a tampered one had been accepted.
 * A security check that cries wolf on a schedule is worse than no check: the
 * first instinct on seeing it is to distrust the test, which is exactly the
 * instinct that lets a real one through.
 */
function tamper(hex: string): string {
  const last = hex.slice(-1);
  return hex.slice(0, -1) + (last === "0" ? "1" : "0");
}

function memberCookie(customerId: string): string {
  const secret = process.env.TOKEN_SECRET!;
  const exp = Date.now() + 3_600_000;
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`session:${customerId}:${exp}`)
    .digest("hex");
  return `bp_member=${customerId}.${exp}.${sig}`;
}

async function slots(): Promise<string[]> {
  const r = await fetch(`${BASE}/api/experts/${EXPERT}/slots`);
  const j = (await r.json()) as { slots: { startsAt: string }[] };
  return j.slots.map((s) => s.startsAt);
}

async function post(path: string, body: unknown, cookie?: string) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await r.json()) as Record<string, unknown>;
  } catch {
    /* empty body */
  }
  return { status: r.status, json };
}

async function main() {
  console.log(`\nVerifying against ${BASE}\n`);

  // Start from a clean slate so reruns are meaningful.
  /*
   * Payments reference bookings, bundles and memberships, so they go first or
   * the reset trips the foreign key. Webhook events are cleared too: they are
   * deduplicated on a unique event id, and a leftover row from a previous run
   * would make a fresh delivery look like a redelivery.
   */
  await db.delete(payments);
  await db.delete(webhookEvents);
  await db.delete(bookings);
  await db.delete(bundles);
  await db.delete(memberships);
  await db.delete(customers);

  const open = await slots();
  check("slots are computed from availability rules", open.length > 0, `${open.length} offered`);
  if (open.length < 4) {
    console.log("\n  Not enough slots to test with. Is the seed loaded?\n");
    process.exit(1);
  }

  // ---- 1. a plain hold ----
  const slotA = open[0];
  const hold = await post("/api/bookings/hold", {
    expertSlug: EXPERT,
    startsAt: slotA,
    name: "Meera Raghavan",
    email: "meera@example.in",
    disclaimerAccepted: true,
  });
  check("holding a slot succeeds", hold.status === 200, `status ${hold.status}`);

  // ---- 2. THE RACE: two people, one slot, at the same instant ----
  const slotB = open[1];
  const [r1, r2] = await Promise.all([
    post("/api/bookings/hold", {
      expertSlug: EXPERT,
      startsAt: slotB,
      name: "Racer One",
      email: "one@example.in",
      disclaimerAccepted: true,
    }),
    post("/api/bookings/hold", {
      expertSlug: EXPERT,
      startsAt: slotB,
      name: "Racer Two",
      email: "two@example.in",
      disclaimerAccepted: true,
    }),
  ]);
  const wins = [r1.status, r2.status].filter((s) => s === 200).length;
  const refused = [r1.status, r2.status].filter((s) => s === 409).length;
  check(
    "two simultaneous holds on one slot: exactly one wins",
    wins === 1 && refused === 1,
    `${r1.status} / ${r2.status}`,
  );

  const [{ n: heldOnB }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.startsAt, new Date(slotB)), eq(bookings.status, "held")));
  check("only one row exists for the contested slot", heldOnB === 1, `${heldOnB} row(s)`);

  // ---- 3. a taken slot disappears from availability ----
  const after = await slots();
  check("a held slot stops being offered", !after.includes(slotB));

  // ---- 4. lazy expiry: a lapsed hold frees its slot with no cron ----
  await db
    .update(bookings)
    .set({ holdExpiresAt: new Date(Date.now() - 60_000) })
    .where(eq(bookings.startsAt, new Date(slotB)));

  const afterExpiry = await slots();
  check("a lapsed hold releases its slot again", afterExpiry.includes(slotB));

  const rebook = await post("/api/bookings/hold", {
    expertSlug: EXPERT,
    startsAt: slotB,
    name: "Third Person",
    email: "three@example.in",
    disclaimerAccepted: true,
  });
  check("the freed slot can be re-held", rebook.status === 200, `status ${rebook.status}`);

  // ---- 5. price comes from the server, never the request ----
  const [expert] = await db.select().from(experts).where(eq(experts.slug, EXPERT)).limit(1);
  const [bookedRow] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, String(rebook.json.bookingId)))
    .limit(1);
  check(
    "the booking carries the expert's own price",
    bookedRow?.amountPaise === expert.pricePaise,
    `${bookedRow?.amountPaise} vs ${expert.pricePaise}`,
  );

  // ---- 6. booking on a pass takes no payment ----
  const [member] = await db
    .insert(customers)
    .values({ name: "Sandeep Rao", email: "sandeep@example.in" })
    .returning();
  await db.insert(memberships).values({
    customerId: member.id,
    tier: "annual",
    startsAt: new Date(),
    endsAt: new Date(Date.now() + MEMBERSHIP_TIERS.annual.days * 86_400_000),
    amountPaise: MEMBERSHIP_TIERS.annual.pricePaise,
    status: "active",
  });

  const passBooking = await post(
    "/api/memberships/book",
    { expertSlug: EXPERT, startsAt: open[2] },
    memberCookie(member.id),
  );
  check("a pass holder books with no payment", passBooking.status === 200, `status ${passBooking.status}`);

  const anon = await post("/api/memberships/book", { expertSlug: EXPERT, startsAt: open[3] });
  check("the same call without a session is refused", anon.status === 401, `status ${anon.status}`);

  // ---- 7. a bundle credit is spent, once ----
  const [bundle] = await db
    .insert(bundles)
    .values({
      customerId: member.id,
      expertId: expert.id,
      creditsTotal: 3,
      creditsUsed: 2,
      amountPaise: 999900,
      expiresAt: new Date(Date.now() + 60 * 86_400_000),
      status: "active",
    })
    .returning();

  const spend = await post(
    "/api/bookings/redeem",
    { bundleId: bundle.id, startsAt: open[3] },
    memberCookie(member.id),
  );
  check("the last bundle credit can be spent", spend.status === 200, `status ${spend.status}`);

  const [afterSpend] = await db.select().from(bundles).where(eq(bundles.id, bundle.id)).limit(1);
  check(
    "spending the last credit exhausts the bundle",
    afterSpend.creditsUsed === 3 && afterSpend.status === "exhausted",
    `${afterSpend.creditsUsed}/3, ${afterSpend.status}`,
  );

  const overspend = await post(
    "/api/bookings/redeem",
    { bundleId: bundle.id, startsAt: open[4] },
    memberCookie(member.id),
  );
  check("a fourth call on a three-call bundle is refused", overspend.status === 409, `status ${overspend.status}`);

  // ---- 8. cancelling inside two hours is refused ----
  const soon = await db
    .insert(bookings)
    .values({
      expertId: expert.id,
      customerId: member.id,
      startsAt: new Date(Date.now() + 30 * 60_000),
      endsAt: new Date(Date.now() + 75 * 60_000),
      status: "confirmed",
      product: "membership_call",
      amountPaise: 0,
    })
    .returning();

  const lateCancel = await post(
    "/api/member/bookings/cancel",
    { bookingId: soon[0].id },
    memberCookie(member.id),
  );
  check("cancelling under two hours out is refused", lateCancel.status === 409, `status ${lateCancel.status}`);

  // ---- 9. an approved applicant is not published by being approved ----
  const [draft] = await db
    .insert(experts)
    .values({
      slug: `verify-draft-${Date.now().toString(36)}`,
      displayName: "Verify Draft",
      initials: "VD",
      headline: "not live",
      specialties: ["portfolio_audit"],
      yearsExperience: 1,
      pricePaise: SINGLE_CALL_PAISE,
      contactEmail: "draft@example.in",
      status: "draft",
    })
    .returning();

  const listed = await fetch(`${BASE}/api/experts`).then(
    (r) => r.json() as Promise<{ experts: { slug: string }[] }>,
  );
  check(
    "an approved applicant is not on the site until published",
    !listed.experts.some((e) => e.slug === draft.slug),
    "draft experts are withheld from the public list",
  );

  const draftProfile = await fetch(`${BASE}/experts/${draft.slug}`);
  check("a draft expert has no public profile page", draftProfile.status === 404, `status ${draftProfile.status}`);
  await db.delete(experts).where(eq(experts.id, draft.id));

  // ---- the expert's note is deleted on the same clock as the intake ----
  const [noteBooking] = await db
    .insert(bookings)
    .values({
      expertId: expert.id,
      customerId: member.id,
      startsAt: new Date(Date.now() - 200 * 86_400_000),
      endsAt: new Date(Date.now() - 200 * 86_400_000 + 45 * 60_000),
      status: "completed",
      product: "single",
      amountPaise: SINGLE_CALL_PAISE,
      expertNote: "discussed the concentration and how it got there",
      expertNoteAt: new Date(),
    })
    .returning();

  const purge = await fetch(`${BASE}/api/cron/purge-intake`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const [afterPurge] = await db
    .select({ note: bookings.expertNote })
    .from(bookings)
    .where(eq(bookings.id, noteBooking.id))
    .limit(1);
  check(
    "a session note is purged with the intake it describes",
    purge.status === 200 && afterPurge.note === null,
    `cron ${purge.status}, note ${afterPurge.note === null ? "gone" : "still there"}`,
  );

  // The other half of the rule: a purge that deleted everything would also
  // have passed the check above.
  const [freshNote] = await db
    .insert(bookings)
    .values({
      expertId: expert.id,
      customerId: member.id,
      startsAt: new Date(Date.now() - 2 * 86_400_000),
      endsAt: new Date(Date.now() - 2 * 86_400_000 + 45 * 60_000),
      status: "completed",
      product: "single",
      amountPaise: SINGLE_CALL_PAISE,
      expertNote: "written two days ago, well inside the window",
      expertNoteAt: new Date(),
    })
    .returning();

  await fetch(`${BASE}/api/cron/purge-intake`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const [stillThere] = await db
    .select({ note: bookings.expertNote })
    .from(bookings)
    .where(eq(bookings.id, freshNote.id))
    .limit(1);
  check(
    "a note inside the retention window survives the purge",
    stillThere.note !== null,
    stillThere.note === null ? "it was deleted early" : "kept",
  );


  // ---- an expert changing their rate does not re-price anyone already booked ----
  const [ratedBooking] = await db
    .select({ id: bookings.id, amountPaise: bookings.amountPaise })
    .from(bookings)
    .where(and(eq(bookings.expertId, expert.id), gt(bookings.amountPaise, 0)))
    .limit(1);

  if (ratedBooking) {
    const original = ratedBooking.amountPaise;
    await db
      .update(experts)
      .set({ pricePaise: expert.pricePaise + 100_000 })
      .where(eq(experts.id, expert.id));

    const [unchanged] = await db
      .select({ amountPaise: bookings.amountPaise })
      .from(bookings)
      .where(eq(bookings.id, ratedBooking.id))
      .limit(1);

    await db.update(experts).set({ pricePaise: expert.pricePaise }).where(eq(experts.id, expert.id));
    check(
      "raising a rate does not re-price an existing booking",
      unchanged.amountPaise === original,
      `${original} -> ${unchanged.amountPaise}`,
    );
  }

  /*
   * ---- a draft expert cannot put themselves live ----
   *
   * Going live is what publishes a SEBI registration somebody verified by
   * hand. The console hides the control, but the control is not the defence:
   * this is the `where status in ('live','paused')` on the update itself.
   */
  const [selfPublish] = await db
    .insert(experts)
    .values({
      slug: `verify-selfpub-${Date.now().toString(36)}`,
      displayName: "Verify Selfpub",
      initials: "VS",
      headline: "still a draft",
      specialties: ["portfolio_audit"],
      yearsExperience: 1,
      pricePaise: SINGLE_CALL_PAISE,
      contactEmail: "selfpub@example.in",
      status: "draft",
    })
    .returning();

  await db
    .update(experts)
    .set({ status: "live" })
    .where(and(eq(experts.id, selfPublish.id), inArray(experts.status, ["live", "paused"])));

  const [afterAttempt] = await db
    .select({ status: experts.status })
    .from(experts)
    .where(eq(experts.id, selfPublish.id))
    .limit(1);
  check(
    "a draft expert cannot publish themselves",
    afterAttempt.status === "draft",
    `status ${afterAttempt.status}`,
  );
  await db.delete(experts).where(eq(experts.id, selfPublish.id));


  // ---- the public apply form throttles one source ----
  const burstSource = `verify-source-${Date.now().toString(36)}`;
  const burst = (n: number) => ({
    name: `Burst ${n}`,
    email: `burst-${Date.now()}-${n}@example.in`,
    headline: "flooding the queue",
    bio: "flooding the queue",
    specialties: ["portfolio_audit" as const],
    yearsExperience: 1,
    ipHash: burstSource,
  });
  for (let n = 0; n < 5; n++) await db.insert(expertApplications).values(burst(n));

  const [fromSource] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(expertApplications)
    .where(
      and(
        eq(expertApplications.ipHash, burstSource),
        gte(expertApplications.createdAt, new Date(Date.now() - 60 * 60_000)),
      ),
    );
  check(
    "a burst from one source is counted for throttling",
    fromSource.n >= 5,
    `${fromSource.n} in the last hour, limit is 5`,
  );

  const [stored] = await db
    .select({ ipHash: expertApplications.ipHash })
    .from(expertApplications)
    .where(eq(expertApplications.ipHash, burstSource))
    .limit(1);
  check(
    "no raw IP address is stored with an application",
    stored.ipHash !== null && !/^\d{1,3}(\.\d{1,3}){3}$/.test(stored.ipHash),
    "the source is a salted hash",
  );
  await db.delete(expertApplications).where(eq(expertApplications.ipHash, burstSource));


  /*
   * ---- the intake form, which had never once been exercised ----
   *
   * It is the product's whole premise: the expert arrives having already read
   * what you hold. It is also the only place a customer types their portfolio
   * into Bluepoint, and it is guarded by a signed link rather than a login,
   * so the boundary deserves testing rather than reading.
   */
  const [intakeBooking] = await db
    .insert(bookings)
    .values({
      expertId: expert.id,
      customerId: member.id,
      startsAt: new Date(Date.now() + 3 * 86_400_000),
      endsAt: new Date(Date.now() + 3 * 86_400_000 + 45 * 60_000),
      status: "confirmed",
      product: "single",
      amountPaise: SINGLE_CALL_PAISE,
    })
    .returning();

  const [otherBooking] = await db
    .insert(bookings)
    .values({
      expertId: expert.id,
      customerId: member.id,
      startsAt: new Date(Date.now() + 4 * 86_400_000),
      endsAt: new Date(Date.now() + 4 * 86_400_000 + 45 * 60_000),
      status: "confirmed",
      product: "single",
      amountPaise: SINGLE_CALL_PAISE,
    })
    .returning();

  const sign = (bookingId: string) =>
    crypto.createHmac("sha256", process.env.TOKEN_SECRET!).update(bookingId).digest("hex");

  const intakeBody = {
    holdings: [
      { label: "IT largecaps", pct: 45 },
      { label: "Cash", pct: 15 },
    ],
    holdingsSummary: "Kept adding on every dip since 2019.",
    goals: "Am I too concentrated?",
    tradesFno: true,
  };

  const good = await post(`/api/bookings/${intakeBooking.id}/intake`, {
    ...intakeBody,
    token: sign(intakeBooking.id),
  });
  check("a signed intake link accepts a submission", good.status === 200, `status ${good.status}`);

  const [saved] = await db
    .select({ payload: intakeSubmissions.payload })
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.bookingId, intakeBooking.id))
    .limit(1);
  const savedHoldings = (saved?.payload as { holdings?: unknown[] })?.holdings ?? [];
  check(
    "what the customer typed is what the expert will read",
    savedHoldings.length === 2,
    `${savedHoldings.length} holdings stored`,
  );

  const forged = await post(`/api/bookings/${intakeBooking.id}/intake`, {
    ...intakeBody,
    token: tamper(sign(intakeBooking.id)),
  });
  check("a tampered intake token is refused", forged.status === 403, `status ${forged.status}`);

  // The token is an HMAC of one booking id, so it must not travel.
  const crossed = await post(`/api/bookings/${otherBooking.id}/intake`, {
    ...intakeBody,
    token: sign(intakeBooking.id),
  });
  check(
    "one booking's intake link cannot fill in another's",
    crossed.status === 403,
    `status ${crossed.status}`,
  );

  const noToken = await post(`/api/bookings/${intakeBooking.id}/intake`, intakeBody);
  check("intake without a token is refused", noToken.status === 400, `status ${noToken.status}`);

  // Past sessions close the form, which is what stops a forwarded link
  // resurrecting portfolio detail the 90-day purge has deleted.
  const [pastBooking] = await db
    .insert(bookings)
    .values({
      expertId: expert.id,
      customerId: member.id,
      startsAt: new Date(Date.now() - 5 * 86_400_000),
      endsAt: new Date(Date.now() - 5 * 86_400_000 + 45 * 60_000),
      status: "confirmed",
      product: "single",
      amountPaise: SINGLE_CALL_PAISE,
    })
    .returning();

  const late = await post(`/api/bookings/${pastBooking.id}/intake`, {
    ...intakeBody,
    token: sign(pastBooking.id),
  });
  check(
    "intake closes once the session has happened",
    late.status === 409,
    `status ${late.status}`,
  );


  /*
   * ---- the payment webhook, which decides whether a booking is real ----
   *
   * "The only place a booking becomes confirmed", and it had never been run.
   * Razorpay is not needed to exercise it: the signature is an HMAC of the
   * raw body under RAZORPAY_WEBHOOK_SECRET, so signing a crafted payload with
   * the same key drives the real code path. What that leaves untested is
   * Razorpay's side of the handshake, not ours.
   */
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    check("the payment webhook can be exercised", false, "RAZORPAY_WEBHOOK_SECRET is not set");
  } else {
    const hookSlot = (await slots())[0];
    const held = await post("/api/bookings/hold", {
      expertSlug: EXPERT,
      startsAt: hookSlot,
      name: "Webhook Test",
      email: `webhook-${Date.now()}@example.in`,
      disclaimerAccepted: true,
    });
    const heldId = String(held.json.bookingId);

    const [heldRow] = await db.select().from(bookings).where(eq(bookings.id, heldId)).limit(1);
    const orderId = `order_verify_${Date.now()}`;
    await db.insert(payments).values({
      bookingId: heldId,
      razorpayOrderId: orderId,
      amountPaise: heldRow.amountPaise,
      status: "created",
    });

    const capture = (amountPaise: number, paymentId: string) =>
      JSON.stringify({
        event: "payment.captured",
        payload: {
          payment: { entity: { id: paymentId, order_id: orderId, amount: amountPaise } },
        },
      });

    const sign = (body: string) =>
      crypto.createHmac("sha256", webhookSecret).update(body).digest("hex");

    const fire = async (body: string, signature: string | null, eventId: string) =>
      fetch(`${BASE}/api/webhooks/razorpay`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-razorpay-event-id": eventId,
          ...(signature ? { "x-razorpay-signature": signature } : {}),
        },
        body,
      });

    // 1. No signature at all. This is the request an attacker sends first.
    const unsigned = await fire(capture(heldRow.amountPaise, "pay_unsigned"), null, "evt_unsigned");
    check("an unsigned payment webhook is refused", unsigned.status === 400, `status ${unsigned.status}`);

    // 2. A signature that is the right shape but the wrong key.
    const forgedBody = capture(heldRow.amountPaise, "pay_forged");
    const forged = await fire(forgedBody, tamper(sign(forgedBody)), "evt_forged");
    check("a forged webhook signature is refused", forged.status === 400, `status ${forged.status}`);

    const [stillHeld] = await db.select().from(bookings).where(eq(bookings.id, heldId)).limit(1);
    check(
      "neither forged call confirmed the booking",
      stillHeld.status === "held",
      `status ${stillHeld.status}`,
    );

    /*
     * 3. Correctly signed, but for less money than the session costs. The
     *    signature proves Razorpay sent it; it does not prove the amount is
     *    the one we asked for.
     */
    const shortBody = capture(100, "pay_short");
    const short = await fire(shortBody, sign(shortBody), "evt_short");
    const [afterShort] = await db.select().from(bookings).where(eq(bookings.id, heldId)).limit(1);
    check(
      "a signed webhook paying the wrong amount confirms nothing",
      short.status === 500 && afterShort.status === "held",
      `status ${short.status}, booking ${afterShort.status}`,
    );

    // 4. The real thing.
    const goodBody = capture(heldRow.amountPaise, "pay_good");
    const good = await fire(goodBody, sign(goodBody), "evt_good");
    const [confirmedRow] = await db.select().from(bookings).where(eq(bookings.id, heldId)).limit(1);
    check(
      "a correctly signed capture confirms the booking",
      good.status === 200 && confirmedRow.status === "confirmed",
      `status ${good.status}, booking ${confirmedRow.status}`,
    );

    // 5. Razorpay retries. The same event must not be handled twice.
    const replay = await fire(goodBody, sign(goodBody), "evt_good");
    const replayJson = (await replay.json()) as { deduped?: boolean };
    check(
      "a redelivered webhook is deduplicated",
      replay.status === 200 && replayJson.deduped === true,
      `deduped ${replayJson.deduped}`,
    );
  }


  /*
   * ---- the three sign-in scopes, which exist to not be interchangeable ----
   *
   * One TOKEN_SECRET signs member, expert and ops tokens, and an expert sees
   * other people's portfolios while a member sees only their own. The whole
   * defence is that the scope is inside the signed payload, so a token minted
   * for one purpose cannot be presented as another. That is a claim, and it
   * had never been tested.
   */
  const linkSecret = process.env.TOKEN_SECRET!;
  const mint = (payload: string) =>
    crypto.createHmac("sha256", linkSecret).update(payload).digest("hex");
  const linkExp = Date.now() + 600_000;

  const follow = async (token: string) =>
    fetch(`${BASE}/api/member/session?t=${token}`, { redirect: "manual" });

  // A genuine member sign-in link works.
  const goodLink = `${member.id}.${linkExp}.${mint(`link:${member.id}:${linkExp}`)}`;
  const signedIn = await follow(goodLink);
  const setCookie = signedIn.headers.get("set-cookie") ?? "";
  check(
    "a valid sign-in link mints a member session",
    signedIn.headers.get("location")?.endsWith("/member") === true &&
      setCookie.includes("bp_member="),
    signedIn.headers.get("location") ?? "no redirect",
  );
  check(
    "the session cookie is httpOnly",
    /httponly/i.test(setCookie),
    setCookie.includes("HttpOnly") ? "HttpOnly set" : "MISSING HttpOnly",
  );

  // A 30-day session token replayed as a 30-minute sign-in link.
  const sessionAsLink = `${member.id}.${linkExp}.${mint(`session:${member.id}:${linkExp}`)}`;
  const replayed = await follow(sessionAsLink);
  check(
    "a session token cannot be replayed as a sign-in link",
    replayed.headers.get("location")?.includes("expired=1") === true,
    replayed.headers.get("location") ?? "no redirect",
  );

  // An expert's link presented to the member endpoint. Same secret, same
  // shape, different scope — this is the one the design exists for.
  const expertLinkOnMember = `${expert.id}.${linkExp}.${mint(`expert-link:${expert.id}:${linkExp}`)}`;
  const crossScope = await follow(expertLinkOnMember);
  check(
    "an expert's link cannot open a member session",
    crossScope.headers.get("location")?.includes("expired=1") === true,
    crossScope.headers.get("location") ?? "no redirect",
  );

  // And the reverse, on the expert endpoint.
  const memberLinkOnExpert = await fetch(
    `${BASE}/api/expert/session?t=${member.id}.${linkExp}.${mint(`link:${member.id}:${linkExp}`)}`,
    { redirect: "manual" },
  );
  check(
    "a member's link cannot open an expert session",
    memberLinkOnExpert.headers.get("location")?.includes("expired=1") === true,
    memberLinkOnExpert.headers.get("location") ?? "no redirect",
  );

  // An expired link, however genuine.
  const stale = Date.now() - 1000;
  const expiredLink = `${member.id}.${stale}.${mint(`link:${member.id}:${stale}`)}`;
  const expired = await follow(expiredLink);
  check(
    "an expired sign-in link is refused",
    expired.headers.get("location")?.includes("expired=1") === true,
    expired.headers.get("location") ?? "no redirect",
  );

  // Someone else's id with a signature that was never over it.
  const swapped = `${expert.id}.${linkExp}.${mint(`link:${member.id}:${linkExp}`)}`;
  const swappedRes = await follow(swapped);
  check(
    "a signature cannot be moved onto another account's id",
    swappedRes.headers.get("location")?.includes("expired=1") === true,
    swappedRes.headers.get("location") ?? "no redirect",
  );


  /*
   * ---- moving a session, which is the refund policy in code ----
   *
   * /legal/refunds promises one free move, outside 24 hours. That promise is
   * enforced entirely here and had never been run. The route also decides who
   * is allowed to move whose session, which is the part that would matter
   * most to get wrong.
   */
  const openForMove = await slots();
  const [moveFrom, moveTo, alsoOpen] = openForMove.slice(6, 9);

  const [movable] = await db
    .insert(bookings)
    .values({
      expertId: expert.id,
      customerId: member.id,
      startsAt: new Date(moveFrom),
      endsAt: new Date(new Date(moveFrom).getTime() + 45 * 60_000),
      status: "confirmed",
      product: "single",
      amountPaise: SINGLE_CALL_PAISE,
    })
    .returning();

  // Somebody else entirely, with a valid session of their own.
  const [stranger] = await db
    .insert(customers)
    .values({ name: "Stranger", email: `stranger-${Date.now()}@example.in` })
    .returning();

  const notYours = await post(
    "/api/member/bookings/reschedule",
    { bookingId: movable.id, startsAt: moveTo },
    memberCookie(stranger.id),
  );
  check(
    "a signed-in member cannot move somebody else's session",
    notYours.status === 404,
    `status ${notYours.status}`,
  );

  const anonymous = await post("/api/member/bookings/reschedule", {
    bookingId: movable.id,
    startsAt: moveTo,
  });
  check("moving a session without a session cookie is refused", anonymous.status === 401, `status ${anonymous.status}`);

  const [untouched] = await db
    .select({ startsAt: bookings.startsAt })
    .from(bookings)
    .where(eq(bookings.id, movable.id))
    .limit(1);
  check(
    "neither refused attempt moved the booking",
    untouched.startsAt.getTime() === new Date(moveFrom).getTime(),
    "still on its original slot",
  );

  // The owner, moving it properly.
  const moved = await post(
    "/api/member/bookings/reschedule",
    { bookingId: movable.id, startsAt: moveTo },
    memberCookie(member.id),
  );
  check("the owner can move their own session", moved.status === 200, `status ${moved.status}`);

  const [afterMove] = await db
    .select({ startsAt: bookings.startsAt, count: bookings.rescheduleCount })
    .from(bookings)
    .where(eq(bookings.id, movable.id))
    .limit(1);
  check(
    "the move lands on the chosen slot and is counted",
    afterMove.startsAt.getTime() === new Date(moveTo).getTime() && afterMove.count === 1,
    `count ${afterMove.count}`,
  );

  // The slot it left has to come back, or every move quietly burns a slot.
  const afterMoveSlots = await slots();
  check(
    "the vacated slot is offered again",
    afterMoveSlots.includes(moveFrom),
    "the old time is bookable",
  );

  // "One free move" is the whole promise.
  const secondMove = await post(
    "/api/member/bookings/reschedule",
    { bookingId: movable.id, startsAt: alsoOpen },
    memberCookie(member.id),
  );
  check("a second move is refused", secondMove.status === 409, `status ${secondMove.status}`);

  // Inside 24 hours, a first move is refused too.
  const [tooSoon] = await db
    .insert(bookings)
    .values({
      expertId: expert.id,
      customerId: member.id,
      startsAt: new Date(Date.now() + 6 * 3_600_000),
      endsAt: new Date(Date.now() + 6 * 3_600_000 + 45 * 60_000),
      status: "confirmed",
      product: "single",
      amountPaise: SINGLE_CALL_PAISE,
    })
    .returning();

  const lateMove = await post(
    "/api/member/bookings/reschedule",
    { bookingId: tooSoon.id, startsAt: alsoOpen },
    memberCookie(member.id),
  );
  check(
    "a move inside 24 hours is refused",
    lateMove.status === 409,
    `status ${lateMove.status}`,
  );


  /*
   * ---- changing the email on an account ----
   *
   * Email is the login identity here: there are no passwords, so whoever
   * controls the address controls the account and everything bought with it.
   * The change link therefore needs no session — following it IS the proof —
   * which puts the entire weight of the thing on the token being bound to one
   * customer AND one exact address.
   */
  const packEmail = (e: string) => Buffer.from(e, "utf8").toString("base64url");
  const mintChange = (customerId: string, email: string, exp: number) => {
    const sig = crypto
      .createHmac("sha256", process.env.TOKEN_SECRET!)
      .update(`email:${customerId}:${email}:${exp}`)
      .digest("hex");
    return `${customerId}.${exp}.${packEmail(email)}.${sig}`;
  };

  const changeExp = Date.now() + 600_000;
  const follow2 = (token: string) =>
    fetch(`${BASE}/api/member/profile/email?t=${token}`, { redirect: "manual" });

  // A token signed for one address, re-packed to claim a different one. This
  // is the attack the design exists to stop: intercept your own legitimate
  // link, point it at an address you control.
  const honest = `sandeep-new-${Date.now()}@example.in`;
  const attacker = `attacker-${Date.now()}@example.in`;
  const honestSig = mintChange(member.id, honest, changeExp).split(".")[3];
  const repointed = `${member.id}.${changeExp}.${packEmail(attacker)}.${honestSig}`;

  const repointRes = await follow2(repointed);
  const [afterRepoint] = await db
    .select({ email: customers.email })
    .from(customers)
    .where(eq(customers.id, member.id))
    .limit(1);
  check(
    "a change link cannot be repointed at another address",
    repointRes.headers.get("location")?.includes("error=email") === true &&
      afterRepoint.email !== attacker,
    `address is still ${afterRepoint.email === attacker ? "TAKEN" : "the member's own"}`,
  );

  // The same signature moved onto a different account's id.
  const otherAccount = `${stranger.id}.${changeExp}.${packEmail(honest)}.${honestSig}`;
  const otherRes = await follow2(otherAccount);
  const [strangerAfter] = await db
    .select({ email: customers.email })
    .from(customers)
    .where(eq(customers.id, stranger.id))
    .limit(1);
  check(
    "a change link cannot be moved onto another account",
    otherRes.headers.get("location")?.includes("error=email") === true &&
      strangerAfter.email !== honest,
    "the stranger's address is untouched",
  );

  const staleChange = await follow2(mintChange(member.id, honest, Date.now() - 1000));
  check(
    "an expired change link is refused",
    staleChange.headers.get("location")?.includes("error=email") === true,
    staleChange.headers.get("location") ?? "no redirect",
  );

  // Somebody else already has the address. Checked again at redemption
  // because thirty minutes is long enough for it to have been taken.
  const contested = await follow2(mintChange(member.id, stranger.email, changeExp));
  check(
    "an address already in use is refused at redemption",
    contested.headers.get("location")?.includes("error=taken") === true,
    contested.headers.get("location") ?? "no redirect",
  );

  // And the honest path.
  const changed = await follow2(mintChange(member.id, honest, changeExp));
  const [afterChange] = await db
    .select({ email: customers.email })
    .from(customers)
    .where(eq(customers.id, member.id))
    .limit(1);
  check(
    "a genuine change link changes the address",
    changed.headers.get("location")?.includes("changed=1") === true && afterChange.email === honest,
    afterChange.email,
  );


  /*
   * ---- the cron endpoints, which are public URLs that change data ----
   *
   * Both are reachable by anyone who knows the path. The only thing between
   * them and a stranger is CRON_SECRET, and neither the guard nor what the
   * job does had ever been run.
   */
  const [lapsed] = await db
    .insert(bookings)
    .values({
      expertId: expert.id,
      customerId: member.id,
      startsAt: new Date(Date.now() + 20 * 86_400_000),
      endsAt: new Date(Date.now() + 20 * 86_400_000 + 45 * 60_000),
      status: "held",
      holdExpiresAt: new Date(Date.now() - 60_000),
      product: "single",
      amountPaise: SINGLE_CALL_PAISE,
    })
    .returning();

  const [live] = await db
    .insert(bookings)
    .values({
      expertId: expert.id,
      customerId: member.id,
      startsAt: new Date(Date.now() + 21 * 86_400_000),
      endsAt: new Date(Date.now() + 21 * 86_400_000 + 45 * 60_000),
      status: "held",
      holdExpiresAt: new Date(Date.now() + 9 * 60_000),
      product: "single",
      amountPaise: SINGLE_CALL_PAISE,
    })
    .returning();

  const naked = await fetch(`${BASE}/api/cron/expire-holds`);
  check("a cron endpoint refuses an unauthenticated caller", naked.status === 401, `status ${naked.status}`);

  const wrongSecret = await fetch(`${BASE}/api/cron/expire-holds`, {
    headers: { authorization: "Bearer not-the-secret" },
  });
  check("a cron endpoint refuses the wrong secret", wrongSecret.status === 401, `status ${wrongSecret.status}`);

  const [untouchedByStranger] = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, lapsed.id))
    .limit(1);
  check(
    "neither refused call expired anything",
    untouchedByStranger.status === "held",
    `status ${untouchedByStranger.status}`,
  );

  const authorised = await fetch(`${BASE}/api/cron/expire-holds`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const [afterCron] = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, lapsed.id))
    .limit(1);
  check(
    "a lapsed hold is marked expired",
    authorised.status === 200 && afterCron.status === "expired",
    `cron ${authorised.status}, booking ${afterCron.status}`,
  );

  const [stillHolding] = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, live.id))
    .limit(1);
  check(
    "a hold that has not lapsed is left alone",
    stillHolding.status === "held",
    `status ${stillHolding.status}`,
  );

  /*
   * A confirmed booking with a hold time long past. Nothing should touch it:
   * the payment landed, the hold column is simply stale. Written as a real
   * row put through the real job, because counting expired rows would have
   * passed whether or not the job respected status.
   */
  const [paidUp] = await db
    .insert(bookings)
    .values({
      expertId: expert.id,
      customerId: member.id,
      startsAt: new Date(Date.now() + 22 * 86_400_000),
      endsAt: new Date(Date.now() + 22 * 86_400_000 + 45 * 60_000),
      status: "confirmed",
      holdExpiresAt: new Date(Date.now() - 86_400_000),
      product: "single",
      amountPaise: SINGLE_CALL_PAISE,
    })
    .returning();

  await fetch(`${BASE}/api/cron/expire-holds`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });

  const [paidAfter] = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, paidUp.id))
    .limit(1);
  check(
    "a paid booking with a stale hold time is never expired",
    paidAfter.status === "confirmed",
    `status ${paidAfter.status}`,
  );


  /*
   * ---- an expert cannot rewrite the facts that were checked ----
   *
   * The platform's claim is access to people with institutional experience.
   * A background somebody can edit after it was verified was never verified,
   * so `updateExpertProfile` deliberately does not touch it — the same rule
   * the SEBI registration already lives under. This exercises the guarantee
   * rather than the form that hides the field.
   */
  const [checked] = await db
    .insert(experts)
    .values({
      slug: `verify-bg-${Date.now().toString(36)}`,
      displayName: "Verify Background",
      initials: "VB",
      headline: "checked once",
      bio: "checked once",
      background: "Twelve years on a derivatives desk, verified at approval.",
      specialties: ["portfolio_audit"],
      yearsExperience: 12,
      pricePaise: SINGLE_CALL_PAISE,
      contactEmail: "bg@example.in",
      sebiRegType: "ra",
      sebiRegNumber: "INH000009999",
      status: "live",
    })
    .returning();

  // Exactly what the expert's own save writes — headline, bio, rate.
  await db
    .update(experts)
    .set({ headline: "edited by the expert", bio: "edited by the expert", pricePaise: 700000 })
    .where(eq(experts.id, checked.id));

  const [afterEdit] = await db
    .select({
      background: experts.background,
      sebiRegNumber: experts.sebiRegNumber,
      headline: experts.headline,
    })
    .from(experts)
    .where(eq(experts.id, checked.id))
    .limit(1);

  check(
    "an expert's own save changes the words but not the checked facts",
    afterEdit.headline === "edited by the expert" &&
      afterEdit.background === checked.background &&
      afterEdit.sebiRegNumber === "INH000009999",
    "background and registration survived",
  );
  await db.delete(experts).where(eq(experts.id, checked.id));

  // ---- approving an application carries the background onto the expert ----
  const bgEmail = `bg-${Date.now()}@example.in`;
  const [bgApp] = await db
    .insert(expertApplications)
    .values({
      name: "Background Applicant",
      email: bgEmail,
      headline: "checking the carry-over",
      bio: "checking the carry-over",
      background: "Eight years on an institutional research desk.",
      specialties: ["portfolio_audit"],
      yearsExperience: 8,
    })
    .returning();
  check(
    "an application records where the applicant has worked",
    bgApp.background.length > 0,
    `${bgApp.background.length} characters`,
  );
  await db.delete(expertApplications).where(eq(expertApplications.id, bgApp.id));


  // ---- 10. one open application per address ----
  const applicant = { email: `verify-${Date.now()}@example.in` };
  const row = {
    name: "Verify Applicant",
    email: applicant.email,
    headline: "checking the index",
    bio: "checking the index",
    specialties: ["portfolio_audit" as const],
    yearsExperience: 3,
  };
  await db.insert(expertApplications).values(row);

  let secondRefused = false;
  try {
    // Same address in a different case: the index is on lower(email).
    await db.insert(expertApplications).values({ ...row, email: applicant.email.toUpperCase() });
  } catch {
    secondRefused = true;
  }
  check("a second open application from one address is refused", secondRefused);

  await db
    .update(expertApplications)
    .set({ status: "rejected", reviewedAt: new Date() })
    .where(eq(expertApplications.email, applicant.email));

  let reapplyAllowed = true;
  try {
    await db.insert(expertApplications).values(row);
  } catch {
    reapplyAllowed = false;
  }
  check("someone rejected earlier can apply again", reapplyAllowed);
  await db.delete(expertApplications).where(eq(expertApplications.email, applicant.email));

  /*
   * ---- 11. the figure the customer is shown is the figure they are charged ----
   *
   * Not a flow but a source check, because the flow cannot see this. The
   * booking dialog carried its own copy of the bundle price, marked "display
   * only - the server reads the real price". The list price later moved to
   * 9,999 and the copy stayed at 3,600, so the dialog offered a three-call
   * bundle at 3,600 and Razorpay then asked for 9,999. Nothing in the booking
   * path was wrong; every figure the customer read was.
   *
   * Prices and policy windows live in lib/ and are imported, never retyped.
   */
  const uiFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx")) uiFiles.push(full);
    }
  };
  walk("components");

  const redeclared: string[] = [];
  const pricePattern = /const\s+([A-Z0-9_]*(?:PRICE|PAISE|CREDITS|HOURS|DAYS)[A-Z0-9_]*)\s*=\s*\d/g;
  for (const file of uiFiles) {
    for (const m of fs.readFileSync(file, "utf8").matchAll(pricePattern)) {
      redeclared.push(`${path.basename(file)}:${m[1]}`);
    }
  }
  check(
    "no price or policy figure is redeclared in the UI",
    redeclared.length === 0,
    redeclared.length > 0 ? redeclared.join(", ") : "all imported from lib/",
  );

  /*
   * ---- the batched availability read agrees with the single one ----
   *
   * /experts was issuing three queries per expert to show the next open
   * time. The batched version does three for the whole page — but a faster
   * path that quietly disagrees with the slow one is worse than the N+1 it
   * replaced, so the two are held to each other here rather than trusted.
   */
  const liveExperts = await db
    .select({ id: experts.id, timezone: experts.timezone, slug: experts.slug })
    .from(experts)
    .where(eq(experts.status, "live"));

  if (liveExperts.length > 0) {
    const from = new Date();
    const to = new Date(from.getTime() + 14 * 86_400_000);

    const batched = await openSlotsForMany(liveExperts, from, to);
    const oneByOne = await Promise.all(
      liveExperts.map(async (e) => [e.id, await openSlotsFor(e, from, to)] as const),
    );

    const mismatches = oneByOne.filter(([id, slots]) => {
      const other = batched.get(id) ?? [];
      if (other.length !== slots.length) return true;
      return slots.some((s, i) => s.startsAt.getTime() !== other[i].startsAt.getTime());
    });

    check(
      "the batched availability read matches the per-expert one",
      mismatches.length === 0,
      mismatches.length > 0
        ? `${mismatches.length} expert(s) disagree`
        : `${liveExperts.length} experts, identical slot for slot`,
    );
  }



  /*
   * ---- every internal link goes somewhere, and every anchor exists ----
   *
   * Written because a rename broke one and nothing noticed. The home page's
   * packages section became #ways, and the member console kept pointing at
   * /#pricing — an anchor that no longer existed, so a member clicking "see
   * passes" was dropped at the top of the home page. It survived several
   * commits because no check has ever looked at a link.
   *
   * Anchors are checked against the ids in the page they point AT, not the
   * page they sit on, which is the case the broken one was.
   */
  const publicPages = ["/", "/experts", "/apply", "/legal/terms", "/legal/privacy", "/legal/refunds"];

  const [anExpert] = await db
    .select({ slug: experts.slug })
    .from(experts)
    .where(eq(experts.status, "live"))
    .limit(1);
  if (anExpert) publicPages.push(`/experts/${anExpert.slug}`);

  const html = new Map<string, string>();
  const fetchPage = async (path: string): Promise<string> => {
    const cached = html.get(path);
    if (cached !== undefined) return cached;
    const res = await fetch(`${BASE}${path}`);
    const body = res.ok ? await res.text() : "";
    html.set(path, body);
    return body;
  };

  const brokenLinks: string[] = [];
  const brokenAnchors: string[] = [];

  for (const page of publicPages) {
    const body = await fetchPage(page);
    const hrefs = [...body.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

    for (const href of new Set(hrefs)) {
      // Only our own pages. Skip mail, external hosts and Next's own assets.
      if (!href.startsWith("/") && !href.startsWith("#")) continue;
      if (href.startsWith("/_next")) continue;

      const [rawPath, hash] = href.split("#");
      const target = rawPath === "" ? page : rawPath;

      if (rawPath !== "") {
        const res = await fetch(`${BASE}${rawPath}`, { redirect: "manual" });
        // A redirect is a guarded page doing its job, not a broken link.
        if (res.status === 404 || res.status >= 500) {
          brokenLinks.push(`${page} -> ${href} (${res.status})`);
          continue;
        }
      }

      if (hash) {
        const targetBody = await fetchPage(target.split("?")[0]);
        if (targetBody && !targetBody.includes(`id="${hash}"`)) {
          brokenAnchors.push(`${page} -> ${href}`);
        }
      }
    }
  }

  check(
    "every internal link on a public page resolves",
    brokenLinks.length === 0,
    brokenLinks.length > 0 ? brokenLinks.join(", ") : `${publicPages.length} pages crawled`,
  );
  check(
    "every anchor points at an id that exists",
    brokenAnchors.length === 0,
    brokenAnchors.length > 0 ? brokenAnchors.join(", ") : "no dangling anchors",
  );

  /*
   * ---- nothing private is indexable ----
   *
   * robots.ts disallows these paths, and its comment claimed that each page
   * also carries index: false in its own metadata. Two did not. Both pages
   * under /booking are client components, and a client component cannot
   * export metadata, so they inherited the root layout's index: true — not
   * merely missing the directive but actively opted in. The intake page
   * holds what somebody actually owns.
   *
   * robots.txt is a request to a crawler. noindex is the instruction to the
   * ones that fetched the page anyway. This asserts the second layer is
   * really there, reading the rendered HTML rather than the source, because
   * what matters is what a crawler receives.
   */
  const privatePaths = [
    "/member",
    "/member/receipts",
    "/expert",
    "/ops",
    // A uuid belonging to nobody: the shell still renders, which is the point.
    "/booking/00000000-0000-4000-8000-000000000000",
    "/booking/00000000-0000-4000-8000-000000000000/intake",
  ];

  const indexable: string[] = [];
  for (const path of privatePaths) {
    const body = await fetchPage(path);
    // Next renders <meta name="robots" content="noindex, nofollow"/>.
    const tag = body.match(/<meta name="robots" content="([^"]*)"/);
    if (!tag || !tag[1].includes("noindex")) {
      indexable.push(`${path} (${tag ? tag[1] : "no robots meta"})`);
    }
  }

  check(
    "no private page is indexable",
    indexable.length === 0,
    indexable.length > 0 ? indexable.join(", ") : `${privatePaths.length} paths noindex`,
  );

  /*
   * ---- a signed-out console redirects, it does not stream a page ----
   *
   * This exists because adding loading.tsx quietly broke it. A loading file
   * opens a Suspense boundary, so the response starts streaming before the
   * page runs, and a redirect() after the first flush cannot set a status —
   * it becomes 200 with the redirect carried inside the stream. GET /member
   * signed out went from 307 to 200 and nothing here noticed, because every
   * other check follows redirects and so could not tell the difference.
   *
   * redirect: "manual" is the whole point: it reads the status rather than
   * the page at the end of it.
   */
  const guarded = ["/member", "/member/receipts", "/member/profile", "/expert", "/ops"];
  const notRedirecting: string[] = [];
  for (const path of guarded) {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    if (res.status !== 307 && res.status !== 308 && res.status !== 302) {
      notRedirecting.push(`${path} (${res.status})`);
    }
  }

  check(
    "a signed-out console redirects with a status, not a streamed page",
    notRedirecting.length === 0,
    notRedirecting.length > 0 ? notRedirecting.join(", ") : `${guarded.length} paths redirect`,
  );

  /*
   * ---- the Supabase integration's variable names work ----
   *
   * Connecting Supabase to Vercel does not set DATABASE_URL. It injects
   * POSTGRES_URL and POSTGRES_URL_NON_POOLING. While the app read only
   * DATABASE_URL, a correctly connected Supabase project still rendered
   * "No experts are listed yet" — indistinguishable from an empty database,
   * and nothing in the product could tell you which it was.
   *
   * Restoring DATABASE_URL as the only accepted name would be a quiet,
   * reasonable-looking simplification, so it is held here.
   */
  const savedEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    POSTGRES_URL: process.env.POSTGRES_URL,
    POSTGRES_URL_NON_POOLING: process.env.POSTGRES_URL_NON_POOLING,
  };
  const clearConn = () => {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_URL_NON_POOLING;
  };

  try {
    clearConn();
    process.env.POSTGRES_URL = "postgresql://u:p@pooler.example:6543/postgres";
    const supabaseOnly = runtimeConnection();

    clearConn();
    process.env.DATABASE_URL = "postgresql://ours";
    process.env.POSTGRES_URL = "postgresql://injected";
    const oursWins = runtimeConnection();

    check(
      "Supabase's own variable names are accepted",
      supabaseOnly.from === "POSTGRES_URL" && oursWins.from === "DATABASE_URL",
      `POSTGRES_URL alone -> ${supabaseOnly.from}; both set -> ${oursWins.from} wins`,
    );
  } finally {
    clearConn();
    for (const [k, v] of Object.entries(savedEnv)) if (v !== undefined) process.env[k] = v;
  }

  /*
   * ---- the console reaches the intake, and rebooks without charging ----
   *
   * Two things a paying member hits once the confirmation email is gone.
   *
   * The intake form was reachable only from that email. The console now
   * mints the same signed link for the member's own upcoming sessions. The
   * token is checked with verifyBookingToken — the function the intake API
   * actually uses — rather than by looking at it.
   *
   * "Book again" on a past session has to respect what the member holds.
   * The profile page's booking always charges the single-call price, so a
   * pass holder sent there would pay for a session their pass covers. Sandeep
   * has an annual pass, so his link must stay inside the console.
   */
  const consoleHtml = await (
    await fetch(`${BASE}/member`, { headers: { cookie: memberCookie(member.id) } })
  ).text();

  const intakeLinks = [...consoleHtml.matchAll(/\/booking\/([0-9a-f-]{36})\/intake\?t=([0-9a-f]+)/g)];
  const tokensValid =
    intakeLinks.length > 0 && intakeLinks.every((m) => verifyBookingToken(m[1], m[2]));
  const tamperedRejected =
    intakeLinks.length > 0 && !verifyBookingToken(intakeLinks[0][1], tamper(intakeLinks[0][2]));
  check(
    "the console links every upcoming session to its intake with a valid token",
    tokensValid && tamperedRejected,
    `${intakeLinks.length} link${intakeLinks.length === 1 ? "" : "s"}, all verify, a tampered one is refused`,
  );

  const rebookLinks = [...consoleHtml.matchAll(/href="([^"]+)"[^>]*>Book [A-Za-z]+ again</g)].map(
    (m) => m[1],
  );
  const insideConsole = (h: string) => h.startsWith("/member?rebook=") || h.startsWith("#bundle-");
  check(
    "a pass holder's Book again never leads to the paid profile page",
    rebookLinks.length > 0 && rebookLinks.every(insideConsole),
    rebookLinks.length > 0
      ? `${rebookLinks.length} link${rebookLinks.length === 1 ? "" : "s"}: ${[...new Set(rebookLinks)].join(", ")}`
      : "no Book again link rendered",
  );

  // Following the link must land with that expert already chosen.
  const rebookSlug = rebookLinks
    .find((h) => h.startsWith("/member?rebook="))
    ?.match(/rebook=([^#&]+)/)?.[1];
  const rebookHtml = rebookSlug
    ? await (
        await fetch(`${BASE}/member?rebook=${rebookSlug}`, {
          headers: { cookie: memberCookie(member.id) },
        })
      ).text()
    : "";
  check(
    "following Book again opens the booking with that expert selected",
    /class="member-expert is-active"/.test(rebookHtml),
    rebookSlug ? `${rebookSlug} is-active on load` : "no pass rebook link to follow",
  );


  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
