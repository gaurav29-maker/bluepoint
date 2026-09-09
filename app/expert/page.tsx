import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, customers, experts, intakeSubmissions } from "@/lib/db/schema";
import { EXPERT_COOKIE, verifyExpertSession } from "@/lib/expert-auth";
import { istDateTime } from "@/lib/format";
import ExpertBar from "@/components/expert/ExpertBar";
import { rethrowIfNavigation } from "@/lib/nav";
import {
  markCompleted,
  markNoShow,
  saveSessionNote,
  setMeetingLink,
} from "./actions";

export const metadata: Metadata = { title: "Your schedule — Bluepoint", robots: { index: false } };
export const dynamic = "force-dynamic";

type Intake = {
  holdings?: { label: string; pct: number }[];
  holdingsSummary?: string;
  goals?: string;
  experienceYears?: number;
  riskComfort?: string;
  tradesFno?: boolean;
  questions?: string;
};

export default async function ExpertSchedule() {
  const expertId = await verifyExpertSession((await cookies()).get(EXPERT_COOKIE)?.value);
  if (!expertId) redirect("/expert/login");

  let data;
  try {
    const [expert] = await db.select().from(experts).where(eq(experts.id, expertId)).limit(1);
    if (!expert) redirect("/expert/login");

    const rows = await db
      .select({
        booking: bookings,
        customerName: customers.name,
        payload: intakeSubmissions.payload,
        purgedAt: intakeSubmissions.purgedAt,
      })
      .from(bookings)
      .innerJoin(customers, eq(bookings.customerId, customers.id))
      .leftJoin(intakeSubmissions, eq(intakeSubmissions.bookingId, bookings.id))
      .where(
        and(
          eq(bookings.expertId, expertId),
          inArray(bookings.status, ["confirmed", "completed", "no_show"]),
        ),
      )
      .orderBy(asc(bookings.startsAt));

    const now = new Date();
    data = {
      expert,
      upcoming: rows.filter((r) => r.booking.status === "confirmed" && r.booking.startsAt >= now),
      toClose: rows.filter((r) => r.booking.status === "confirmed" && r.booking.startsAt < now),
      done: rows
        .filter((r) => r.booking.status !== "confirmed")
        .sort((a, b) => b.booking.startsAt.getTime() - a.booking.startsAt.getTime())
        .slice(0, 12),
    };
  } catch (err) {
    rethrowIfNavigation(err);
    return (
      <div className="wrap bp-page member">
        <div className="bp-panel">
          <h1>Not available right now</h1>
          <p className="bp-muted">We could not reach your schedule. Please try again shortly.</p>
        </div>
      </div>
    );
  }

  const { expert, upcoming, toClose, done } = data;

  /*
   * The note is what the customer is left holding after the call. It is
   * framed here, at the point of writing, as an account of what was
   * DISCUSSED — because an expert typing "cut IT to 30%" would be putting a
   * written personalised recommendation into a customer's record, which is
   * the one thing the terms promise Bluepoint does not do.
   */
  const noteForm = (r: (typeof upcoming)[number]) => (
    <form action={saveSessionNote} className="xp-note-form">
      <label className="xp-note-label" htmlFor={`note-${r.booking.id}`}>
        What was discussed
      </label>
      <input type="hidden" name="bookingId" value={r.booking.id} />
      <textarea
        id={`note-${r.booking.id}`}
        name="note"
        rows={3}
        maxLength={900}
        className="xp-note-input"
        defaultValue={r.booking.expertNote ?? ""}
        placeholder="What you went through together, in a line or two."
      />
      <div className="xp-note-foot">
        <span className="xp-note-hint">
          Goes to the customer and stays in their record. Write what you discussed, not what you
          advised.
        </span>
        <button className="ops-btn" type="submit">
          {r.booking.expertNote ? "Update note" : "Save note"}
        </button>
      </div>
    </form>
  );

  const session = (
    r: (typeof upcoming)[number],
    opts: { closable?: boolean; notable?: boolean } = {},
  ) => {
    const payload = (r.payload ?? {}) as Intake;
    const holdings = Array.isArray(payload.holdings) ? payload.holdings : [];
    const hasIntake = Boolean(r.payload) && !r.purgedAt;

    return (
      <li key={r.booking.id} className="xp-session">
        <div className="xp-head">
          <div>
            <b>{istDateTime(r.booking.startsAt)} IST</b>
            <span className="ops-sub">{r.customerName}</span>
          </div>
          <span className={`pill s-${r.booking.status}`}>{r.booking.status.replace("_", " ")}</span>
        </div>

        {hasIntake ? (
          <div className="xp-intake">
            {holdings.length > 0 ? (
              <ul className="xp-holdings">
                {holdings.map((h, i) => (
                  <li key={i}>
                    <span>{h.label}</span>
                    <b>{h.pct}%</b>
                  </li>
                ))}
              </ul>
            ) : null}
            {payload.holdingsSummary ? (
              <p className="xp-note">{payload.holdingsSummary}</p>
            ) : null}
            {payload.goals ? (
              <p className="xp-note">
                <span className="xp-label">Wants</span> {payload.goals}
              </p>
            ) : null}
            {payload.questions ? (
              <p className="xp-note">
                <span className="xp-label">Asked</span> {payload.questions}
              </p>
            ) : null}
            <p className="xp-meta">
              {payload.tradesFno ? "Trades F&O" : "No F&O"}
              {payload.experienceYears !== undefined ? ` · ${payload.experienceYears} yrs` : ""}
              {payload.riskComfort ? ` · risk ${payload.riskComfort}` : ""}
            </p>
          </div>
        ) : (
          <p className="bp-muted xp-none">
            {r.purgedAt
              ? "Intake deleted under the 90-day retention rule."
              : "No intake submitted yet."}
          </p>
        )}

        <div className="xp-actions">
          <form action={setMeetingLink} className="ops-inline">
            <input type="hidden" name="bookingId" value={r.booking.id} />
            <input
              name="meetingUrl"
              className="ops-input"
              placeholder="https://… join link"
              defaultValue={r.booking.meetingUrl ?? ""}
            />
            <button className="ops-btn" type="submit">
              {r.booking.meetingUrl ? "Update link" : "Add link"}
            </button>
          </form>

          {opts.closable ? (
            <>
              <form action={markCompleted}>
                <input type="hidden" name="bookingId" value={r.booking.id} />
                <button className="ops-btn" type="submit">
                  Completed
                </button>
              </form>
              <form action={markNoShow}>
                <input type="hidden" name="bookingId" value={r.booking.id} />
                <button className="ops-btn" type="submit">
                  No-show
                </button>
              </form>
            </>
          ) : null}
        </div>

        {opts.notable ? noteForm(r) : null}
      </li>
    );
  };

  return (
    <div className="wrap bp-page member">
      <ExpertBar current="schedule" />

      <div className="os-status">
        <span className="os-status-user">{expert.displayName}</span>
        <span className="os-status-sep">/</span>
        <span className="os-status-plan">{expert.status}</span>
        <span className="os-status-sep">/</span>
        <span className="os-status-days">
          {upcoming.length} upcoming
          {toClose.length > 0 ? ` · ${toClose.length} to close` : ""}
        </span>
      </div>

      {/*
        Sessions that have already happened come first. They are the only
        thing on this page that needs a decision, and leaving them unresolved
        is what makes a schedule stop being trustworthy.
      */}
      {toClose.length > 0 ? (
        <section className="member-section">
          <h2 className="member-h2">Needs closing</h2>
          <ul className="member-list xp-list">
            {toClose.map((r) => session(r, { closable: true, notable: true }))}
          </ul>
        </section>
      ) : null}

      <section className="member-section">
        <h2 className="member-h2">Coming up</h2>
        {upcoming.length === 0 ? (
          <p className="bp-muted">Nothing booked yet.</p>
        ) : (
          <ul className="member-list xp-list">{upcoming.map((r) => session(r))}</ul>
        )}
      </section>

      {done.length > 0 ? (
        <section className="member-section">
          <h2 className="member-h2">Done</h2>
          <ul className="member-list xp-list">
            {done.map((r) => (
              <li key={r.booking.id} className="xp-done">
                <div className="xp-head">
                  <div>
                    <b>{istDateTime(r.booking.startsAt)} IST</b>
                    <span className="ops-sub">{r.customerName}</span>
                  </div>
                  <span className={`pill s-${r.booking.status}`}>
                    {r.booking.status.replace("_", " ")}
                  </span>
                </div>
                {/* Editable afterwards: a note written in a hurry is worth correcting. */}
                {r.booking.status === "completed" ? noteForm(r) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
