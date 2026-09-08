/**
 * The cancellation and reschedule rules, in one place.
 *
 * These mirror /legal/refunds exactly. If that page changes, this changes with
 * it — a refund policy the software does not implement is worse than no policy,
 * because it is a promise made in writing and broken in code.
 */

export const FREE_CANCEL_HOURS = 24;
export const LATE_CANCEL_HOURS = 2;
export const MAX_RESCHEDULES = 1;

export type CancelOutcome =
  | { allowed: true; refund: "full"; reason: string }
  | { allowed: true; refund: "manual"; reason: string }
  | { allowed: false; reason: string };

export function hoursUntil(startsAt: Date, now: Date = new Date()): number {
  return (startsAt.getTime() - now.getTime()) / 3_600_000;
}

export function cancellationOutcome(startsAt: Date, now: Date = new Date()): CancelOutcome {
  const hours = hoursUntil(startsAt, now);

  if (hours >= FREE_CANCEL_HOURS) {
    return {
      allowed: true,
      refund: "full",
      reason: "Cancelled more than 24 hours ahead, so it is refunded in full.",
    };
  }

  if (hours >= LATE_CANCEL_HOURS) {
    /**
     * The policy says a partial refund here but the figure is still an open
     * bracket on /legal/refunds. Rather than invent a percentage, the slot is
     * released and the refund is left for a person to settle — inventing a
     * number in code would be the software writing policy.
     */
    return {
      allowed: true,
      refund: "manual",
      reason:
        "Cancelled inside 24 hours. The slot is released and we will be in touch about a partial refund.",
    };
  }

  return {
    allowed: false,
    reason:
      "This session starts in under two hours, so it can no longer be cancelled. Your expert has kept the time and prepared.",
  };
}

export function canReschedule(
  startsAt: Date,
  rescheduleCount: number,
  now: Date = new Date(),
): { allowed: boolean; reason: string } {
  if (rescheduleCount >= MAX_RESCHEDULES) {
    return { allowed: false, reason: "This session has already been moved once." };
  }
  if (hoursUntil(startsAt, now) < FREE_CANCEL_HOURS) {
    return {
      allowed: false,
      reason: "Sessions can be moved up to 24 hours before they start.",
    };
  }
  return { allowed: true, reason: "" };
}
