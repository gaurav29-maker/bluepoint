import { and, eq, gte, lte } from "drizzle-orm";
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
