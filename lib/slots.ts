/**
 * Slot computation.
 *
 * Slots are never stored. They are derived per request from recurring rules,
 * minus exceptions, minus bookings that already hold the time. A slots table
 * would need a generator job and would drift; this cannot go stale.
 *
 * All arithmetic is done in minutes-from-midnight in the expert's timezone,
 * and only converted to an absolute instant at the very end.
 */

export const SLOT_MINUTES = 45;
export const DEFAULT_HORIZON_DAYS = 21;
/** Don't offer a slot that starts sooner than this; nobody can prepare in ten minutes. */
export const DEFAULT_LEAD_MINUTES = 120;

export type Interval = { start: number; end: number };

export type AvailabilityRule = { weekday: number; startMinute: number; endMinute: number };

export type AvailabilityException = {
  date: string; // YYYY-MM-DD in the expert's timezone
  kind: "block" | "extra";
  startMinute: number | null;
  endMinute: number | null;
};

export type Slot = { startsAt: Date; endsAt: Date };

/** Milliseconds to add to a UTC instant to get the wall-clock reading in `timeZone`. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/** A civil date + minute-of-day in `timeZone`, resolved to a real instant. */
export function zonedToInstant(dateStr: string, minute: number, timeZone: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, Math.floor(minute / 60), minute % 60);
  // Guess, then correct: the offset itself depends on the instant.
  const firstGuess = naive - zoneOffsetMs(new Date(naive), timeZone);
  const corrected = naive - zoneOffsetMs(new Date(firstGuess), timeZone);
  return new Date(corrected);
}

/** YYYY-MM-DD as read on the wall clock in `timeZone`. */
export function zonedDateString(instant: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(instant);
}

/** 0 = Sunday, for a civil date string. */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** Remove `cut` from every interval in `base`, splitting where it lands inside one. */
export function subtractInterval(base: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const iv of base) {
    if (cut.end <= iv.start || cut.start >= iv.end) {
      out.push(iv);
      continue;
    }
    if (cut.start > iv.start) out.push({ start: iv.start, end: cut.start });
    if (cut.end < iv.end) out.push({ start: cut.end, end: iv.end });
  }
  return out;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  }
  return out;
}

/** The bookable windows for one civil date, in minutes from midnight. */
export function windowsForDate(
  dateStr: string,
  rules: AvailabilityRule[],
  exceptions: AvailabilityException[],
): Interval[] {
  const dayExceptions = exceptions.filter((e) => e.date === dateStr);
  const weekday = weekdayOf(dateStr);

  let windows: Interval[] = rules
    .filter((r) => r.weekday === weekday)
    .map((r) => ({ start: r.startMinute, end: r.endMinute }));

  for (const e of dayExceptions) {
    if (e.kind !== "extra") continue;
    if (e.startMinute === null || e.endMinute === null) continue;
    windows.push({ start: e.startMinute, end: e.endMinute });
  }

  windows = mergeIntervals(windows);

  for (const e of dayExceptions) {
    if (e.kind !== "block") continue;
    // A block with no times blocks the whole day — the common case, a holiday.
    const cut =
      e.startMinute === null || e.endMinute === null
        ? { start: 0, end: 24 * 60 }
        : { start: e.startMinute, end: e.endMinute };
    windows = subtractInterval(windows, cut);
  }

  return windows;
}

export function computeSlots(opts: {
  timezone: string;
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  /** Start times already taken by held/confirmed/completed bookings. */
  takenStarts: Date[];
  from: Date;
  to: Date;
  now?: Date;
  slotMinutes?: number;
  leadMinutes?: number;
}): Slot[] {
  const {
    timezone,
    rules,
    exceptions,
    takenStarts,
    from,
    to,
    now = new Date(),
    slotMinutes = SLOT_MINUTES,
    leadMinutes = DEFAULT_LEAD_MINUTES,
  } = opts;

  const taken = new Set(takenStarts.map((d) => d.getTime()));
  const earliest = now.getTime() + leadMinutes * 60_000;

  const slots: Slot[] = [];
  let cursor = zonedDateString(from, timezone);
  const lastDate = zonedDateString(to, timezone);

  // Bounded by the horizon so a bad range can't spin.
  for (let guard = 0; cursor <= lastDate && guard < 400; guard++, cursor = addDays(cursor, 1)) {
    for (const window of windowsForDate(cursor, rules, exceptions)) {
      for (let m = window.start; m + slotMinutes <= window.end; m += slotMinutes) {
        const startsAt = zonedToInstant(cursor, m, timezone);
        if (startsAt.getTime() < earliest) continue;
        if (startsAt < from || startsAt > to) continue;
        if (taken.has(startsAt.getTime())) continue;
        slots.push({ startsAt, endsAt: new Date(startsAt.getTime() + slotMinutes * 60_000) });
      }
    }
  }

  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
