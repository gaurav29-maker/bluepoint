import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { availabilityExceptions, availabilityRules, bookings } from "@/lib/db/schema";
import { computeSlots, type Slot } from "@/lib/slots";
import { occupiesSlot } from "@/lib/bookings";

/**
 * The open slots for one expert over a window.
 *
 * This block was copied between the slots route and the membership booking
 * route, and a third caller was about to copy it again. Availability is the
 * one calculation the customer, the member console and the expert's own page
 * must all agree on — three copies is three chances for a slot to be offered
 * on one page and refused on another.
 */
export async function openSlotsFor(
  expert: { id: string; timezone: string },
  from: Date,
  to: Date,
): Promise<Slot[]> {
  const [rules, exceptions, taken] = await Promise.all([
    db.select().from(availabilityRules).where(eq(availabilityRules.expertId, expert.id)),
    db.select().from(availabilityExceptions).where(eq(availabilityExceptions.expertId, expert.id)),
    db
      .select({ startsAt: bookings.startsAt })
      .from(bookings)
      .where(
        and(
          eq(bookings.expertId, expert.id),
          occupiesSlot(),
          gte(bookings.startsAt, from),
          lte(bookings.startsAt, to),
        ),
      ),
  ]);

  return computeSlots({
    timezone: expert.timezone,
    rules: rules.map((r) => ({
      weekday: r.weekday,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
    })),
    exceptions: exceptions.map((e) => ({
      date: e.date,
      kind: e.kind,
      startMinute: e.startMinute,
      endMinute: e.endMinute,
    })),
    takenStarts: taken.map((b) => b.startsAt),
    from,
    to,
  });
}

/**
 * The same calculation for several experts, in three queries rather than
 * three per expert.
 *
 * `openSlotsFor` reads rules, exceptions and taken slots for one expert, so a
 * directory listing N experts issued 3N queries on every page view — an N+1,
 * which is a defect at any size rather than an optimisation to reach for
 * later. This asks for all three sets at once and groups them in memory.
 *
 * The result is keyed by expert id and is identical, expert for expert, to
 * calling `openSlotsFor` on each — there is a check in the suite that holds
 * the two to each other, because a faster path that quietly disagrees with
 * the slow one is worse than the N+1 was.
 */
export async function openSlotsForMany(
  experts: { id: string; timezone: string }[],
  from: Date,
  to: Date,
): Promise<Map<string, Slot[]>> {
  const out = new Map<string, Slot[]>();
  if (experts.length === 0) return out;

  const ids = experts.map((e) => e.id);

  const [rules, exceptions, taken] = await Promise.all([
    db.select().from(availabilityRules).where(inArray(availabilityRules.expertId, ids)),
    db.select().from(availabilityExceptions).where(inArray(availabilityExceptions.expertId, ids)),
    db
      .select({ expertId: bookings.expertId, startsAt: bookings.startsAt })
      .from(bookings)
      .where(
        and(
          inArray(bookings.expertId, ids),
          occupiesSlot(),
          gte(bookings.startsAt, from),
          lte(bookings.startsAt, to),
        ),
      ),
  ]);

  const group = <T extends { expertId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const row of rows) {
      const list = m.get(row.expertId);
      if (list) list.push(row);
      else m.set(row.expertId, [row]);
    }
    return m;
  };

  const rulesBy = group(rules);
  const exceptionsBy = group(exceptions);
  const takenBy = group(taken);

  for (const expert of experts) {
    out.set(
      expert.id,
      computeSlots({
        timezone: expert.timezone,
        rules: (rulesBy.get(expert.id) ?? []).map((r) => ({
          weekday: r.weekday,
          startMinute: r.startMinute,
          endMinute: r.endMinute,
        })),
        exceptions: (exceptionsBy.get(expert.id) ?? []).map((e) => ({
          date: e.date,
          kind: e.kind,
          startMinute: e.startMinute,
          endMinute: e.endMinute,
        })),
        takenStarts: (takenBy.get(expert.id) ?? []).map((b) => b.startsAt),
        from,
        to,
      }),
    );
  }

  return out;
}
