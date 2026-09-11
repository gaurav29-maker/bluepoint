"use client";

import { useEffect, useMemo, useState } from "react";

export type BookableExpert = {
  slug: string;
  displayName: string;
  initials: string;
  headline: string;
};

type Slot = { startsAt: string; endsAt: string };

const IST = "Asia/Kolkata";

function dayLabel(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

/**
 * One picker for both ways of booking without paying. A pass books against the
 * membership; a bundle spends a credit. Same slot mechanics, different endpoint
 * — duplicating the picker to change one URL would have been the worse trade.
 */
export default function MemberBooking({
  experts,
  bundleId,
  initialSlug,
}: {
  experts: BookableExpert[];
  bundleId?: string;
  /**
   * Pre-selects an expert. "Book again" on a past session lands here with the
   * expert already chosen, because the point of booking the same person twice
   * is that they already know the portfolio — making the member find them in
   * a list again throws that away at the first step.
   */
  initialSlug?: string;
}) {
  const [expert, setExpert] = useState<BookableExpert | null>(
    // A bundle belongs to one expert; offering a list of one is a decision
    // the member does not have to make.
    experts.length === 1
      ? experts[0]
      : (experts.find((e) => e.slug === initialSlug) ?? null),
  );
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!expert) return;
    let cancelled = false;
    setSlots(null);
    setError(null);
    fetch(`/api/experts/${expert.slug}/slots`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load availability"))))
      .then((d: { slots: Slot[] }) => {
        if (cancelled) return;
        setSlots(d.slots);
        if (d.slots[0]) setActiveDay(dayLabel(d.slots[0].startsAt));
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [expert]);

  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots ?? []) {
      const k = dayLabel(s.startsAt);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [slots]);

  async function book(slot: Slot) {
    if (!expert || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        bundleId ? "/api/bookings/redeem" : "/api/memberships/book",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            bundleId
              ? { bundleId, startsAt: slot.startsAt }
              : { expertSlug: expert.slug, startsAt: slot.startsAt },
          ),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not book that slot");
      window.location.href = `/booking/${json.bookingId}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (experts.length === 0) {
    return <p className="bp-muted">No experts are available to book right now.</p>;
  }

  return (
    <div className="member-book">
      <div className="member-experts">
        {experts.map((e) => (
          <button
            key={e.slug}
            className={`member-expert${expert?.slug === e.slug ? " is-active" : ""}`}
            onClick={() => setExpert(e)}
          >
            <span className="member-expert-av">{e.initials}</span>
            <span>
              <b>{e.displayName}</b>
              <span className="ops-sub">{e.headline}</span>
            </span>
          </button>
        ))}
      </div>

      {expert ? (
        <div className="member-slots">
          {error ? <p className="bp-error">{error}</p> : null}
          {slots === null && !error ? <p className="bp-muted">Loading availability…</p> : null}
          {slots !== null && slots.length === 0 ? (
            <p className="bp-muted">No open slots in the next three weeks.</p>
          ) : null}

          {byDay.size > 0 ? (
            <>
              <div className="bp-day-tabs">
                {[...byDay.keys()].map((d) => (
                  <button
                    key={d}
                    className={`bp-day${d === activeDay ? " is-active" : ""}`}
                    onClick={() => setActiveDay(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="bp-slot-grid">
                {(byDay.get(activeDay ?? "") ?? []).map((s) => (
                  <button
                    key={s.startsAt}
                    className="bp-slot"
                    disabled={busy}
                    onClick={() => book(s)}
                  >
                    {timeLabel(s.startsAt)}
                  </button>
                ))}
              </div>
              <p className="bp-fineprint">
                {bundleId
                  ? "Picking a time books it straight away and spends one of your calls."
                  : "Picking a time books it straight away — nothing to pay, it is inside your pass."}
              </p>
            </>
          ) : null}
        </div>
      ) : (
        <p className="bp-muted">Pick an expert to see their open times.</p>
      )}
    </div>
  );
}
