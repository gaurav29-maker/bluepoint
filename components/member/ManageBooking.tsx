"use client";

import { useState } from "react";
import { FREE_CANCEL_HOURS, LATE_CANCEL_HOURS } from "@/lib/cancellation";

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

export default function ManageBooking({
  bookingId,
  startsAt,
  expertSlug,
  rescheduleCount,
}: {
  bookingId: string;
  startsAt: string;
  expertSlug: string;
  rescheduleCount: number;
}) {
  const [mode, setMode] = useState<"idle" | "moving" | "cancelling">("idle");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const hoursAway = (new Date(startsAt).getTime() - Date.now()) / 3_600_000;
  const freeCancel = hoursAway >= FREE_CANCEL_HOURS;
  const canCancel = hoursAway >= LATE_CANCEL_HOURS;
  const canMove = hoursAway >= FREE_CANCEL_HOURS && rescheduleCount < 1;

  async function openMove() {
    setMode("moving");
    setError(null);
    if (slots) return;
    try {
      const r = await fetch(`/api/experts/${expertSlug}/slots`);
      if (!r.ok) throw new Error("Could not load available times");
      const d = (await r.json()) as { slots: Slot[] };
      setSlots(d.slots);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  async function move(slot: Slot) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/member/bookings/reschedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId, startsAt: slot.startsAt }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not move that session");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/member/bookings/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not cancel that session");
      setDone(j.message ?? "Cancelled.");
      setTimeout(() => window.location.reload(), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (done) return <p className="member-done">{done}</p>;

  return (
    <div className="member-manage">
      {mode === "idle" ? (
        <div className="member-manage-row">
          {canMove ? (
            <button className="ops-btn" onClick={openMove}>
              Move
            </button>
          ) : null}
          {canCancel ? (
            <button className="ops-btn" onClick={() => setMode("cancelling")}>
              Cancel
            </button>
          ) : (
            <span className="bp-muted">Starts soon — no longer cancellable</span>
          )}
          {!canMove && rescheduleCount >= 1 && canCancel ? (
            <span className="bp-muted">Already moved once</span>
          ) : null}
        </div>
      ) : null}

      {mode === "cancelling" ? (
        <div className="member-confirm">
          <p>
            {freeCancel
              ? "This is more than 24 hours away, so it is refunded in full — 5 to 7 working days."
              : "This is inside 24 hours. The slot is released and we will be in touch about a partial refund."}
          </p>
          {error ? <p className="bp-error">{error}</p> : null}
          <div className="member-manage-row">
            <button className="ops-btn danger" disabled={busy} onClick={cancel}>
              {busy ? "Cancelling…" : "Yes, cancel it"}
            </button>
            <button className="ops-btn" disabled={busy} onClick={() => setMode("idle")}>
              Keep it
            </button>
          </div>
        </div>
      ) : null}

      {mode === "moving" ? (
        <div className="member-confirm">
          <p>Pick a new time. You can move a session once, free.</p>
          {error ? <p className="bp-error">{error}</p> : null}
          {slots === null && !error ? <p className="bp-muted">Loading times…</p> : null}
          {slots && slots.length === 0 ? (
            <p className="bp-muted">No other open times in the next three weeks.</p>
          ) : null}
          {slots && slots.length > 0 ? (
            <div className="bp-slot-grid">
              {slots.slice(0, 12).map((s) => (
                <button
                  key={s.startsAt}
                  className="bp-slot"
                  disabled={busy}
                  onClick={() => move(s)}
                  title={`${dayLabel(s.startsAt)} ${timeLabel(s.startsAt)}`}
                >
                  {dayLabel(s.startsAt)}
                  <br />
                  {timeLabel(s.startsAt)}
                </button>
              ))}
            </div>
          ) : null}
          <button className="ops-btn" disabled={busy} onClick={() => setMode("idle")}>
            Never mind
          </button>
        </div>
      ) : null}
    </div>
  );
}
