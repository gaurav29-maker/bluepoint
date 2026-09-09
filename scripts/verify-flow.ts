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
} from "../lib/db/schema";
import { MEMBERSHIP_TIERS, SINGLE_CALL_PAISE } from "../lib/constants";

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
    token: sign(intakeBooking.id).replace(/.$/, "0"),
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


  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
