import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, bundles, experts, intakeSubmissions, memberships } from "@/lib/db/schema";
import { SINGLE_CALL_PAISE } from "@/lib/constants";

/**
 * The member's record: what they have declared holding, session by session,
 * and how that mix has moved.
 *
 * A deliberate constraint runs through this file. The record documents what a
 * member DECLARED and what was DISCUSSED. It never states what was
 * recommended, and never implies a change followed advice — "discussed: IT
 * concentration; then 45%, now 31%" is a conversation and a fact, whereas
 * "flagged too high, now reduced" is a recommendation trail. The terms say
 * Bluepoint does not give personalised advice; the record has to agree.
 */

/** One line a member wrote in their intake. Percentages are their estimate. */
export type Holding = { label: string; pct: number };

export type Snapshot = {
  bookingId: string;
  at: Date;
  expertName: string;
  holdings: Holding[];
  /** Their own words, kept beside the numbers rather than replaced by them. */
  summary: string;
  goals: string;
  questions: string;
};

export type Movement = {
  label: string;
  first: number;
  latest: number;
  delta: number;
};

export type MemberRecord = {
  snapshots: Snapshot[];
  movements: Movement[];
  sessionsTaken: number;
  /** What those sessions would have cost one at a time, for the renewal decision. */
  atSingleCallPaise: number;
  paidPaise: number;
};

function readHoldings(payload: unknown): Holding[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = (payload as { holdings?: unknown }).holdings;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((h) => ({
      label: String((h as Holding)?.label ?? "").trim(),
      pct: Number((h as Holding)?.pct),
    }))
    .filter((h) => h.label !== "" && Number.isFinite(h.pct) && h.pct >= 0);
}

function readText(payload: unknown, key: string): string {
  if (!payload || typeof payload !== "object") return "";
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

export async function recordForCustomer(customerId: string): Promise<MemberRecord> {
  const rows = await db
    .select({
      bookingId: bookings.id,
      at: bookings.startsAt,
      status: bookings.status,
      amountPaise: bookings.amountPaise,
      expertName: experts.displayName,
      payload: intakeSubmissions.payload,
      purgedAt: intakeSubmissions.purgedAt,
    })
    .from(bookings)
    .innerJoin(experts, eq(bookings.expertId, experts.id))
    .leftJoin(intakeSubmissions, eq(intakeSubmissions.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.customerId, customerId),
        inArray(bookings.status, ["confirmed", "completed"]),
      ),
    )
    .orderBy(asc(bookings.startsAt));

  const snapshots: Snapshot[] = rows
    // A purged intake leaves the session in the record but not its contents;
    // the 90-day retention rule outranks the trajectory.
    .filter((r) => r.payload && !r.purgedAt)
    .map((r) => ({
      bookingId: r.bookingId,
      at: r.at,
      expertName: r.expertName,
      holdings: readHoldings(r.payload),
      summary: readText(r.payload, "holdingsSummary"),
      goals: readText(r.payload, "goals"),
      questions: readText(r.payload, "questions"),
    }));

  const sessionsTaken = rows.filter((r) => r.status === "completed").length;

  // Movement is only meaningful for a label the member has used more than once.
  const withHoldings = snapshots.filter((s) => s.holdings.length > 0);
  const movements: Movement[] = [];
  if (withHoldings.length >= 2) {
    const first = withHoldings[0];
    const latest = withHoldings[withHoldings.length - 1];
    const latestByLabel = new Map(latest.holdings.map((h) => [h.label.toLowerCase(), h.pct]));
    for (const h of first.holdings) {
      const now = latestByLabel.get(h.label.toLowerCase());
      if (now === undefined) continue;
      movements.push({ label: h.label, first: h.pct, latest: now, delta: now - h.pct });
    }
    movements.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  const [paid] = await db
    .select({ amountPaise: memberships.amountPaise })
    .from(memberships)
    .where(and(eq(memberships.customerId, customerId), eq(memberships.status, "active")))
    .limit(1);

  return {
    snapshots,
    movements,
    sessionsTaken,
    atSingleCallPaise: sessionsTaken * SINGLE_CALL_PAISE,
    paidPaise: paid?.amountPaise ?? 0,
  };
}

/** Bundles with credits left, so a buyer can actually spend what they bought. */
export async function liveBundlesForCustomer(customerId: string) {
  const rows = await db
    .select({
      bundle: bundles,
      expertName: experts.displayName,
      expertSlug: experts.slug,
      expertInitials: experts.initials,
      expertHeadline: experts.headline,
    })
    .from(bundles)
    .leftJoin(experts, eq(bundles.expertId, experts.id))
    .where(and(eq(bundles.customerId, customerId), eq(bundles.status, "active")));

  return rows
    .filter((r) => r.bundle.creditsUsed < r.bundle.creditsTotal)
    .filter((r) => r.bundle.expiresAt.getTime() > Date.now())
    .map((r) => ({
      id: r.bundle.id,
      creditsLeft: r.bundle.creditsTotal - r.bundle.creditsUsed,
      creditsTotal: r.bundle.creditsTotal,
      expiresAt: r.bundle.expiresAt,
      expertName: r.expertName,
      expertSlug: r.expertSlug,
      expertInitials: r.expertInitials,
      expertHeadline: r.expertHeadline,
    }));
}
