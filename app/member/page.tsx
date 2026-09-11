import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, customers, experts, intakeSubmissions, memberships } from "@/lib/db/schema";
import { MEMBER_COOKIE, verifySession } from "@/lib/member-auth";
import { MEMBERSHIP_TIERS, RENEWAL_WINDOW_DAYS } from "@/lib/constants";
import { istDateTime, rupees } from "@/lib/format";
import MemberBooking, { type BookableExpert } from "@/components/member/MemberBooking";
import { liveBundlesForCustomer, recordForCustomer } from "@/lib/record";
import { rethrowIfNavigation } from "@/lib/nav";
import PassPurchase from "@/components/PassPurchase";
import ManageBooking from "@/components/member/ManageBooking";
import { signBookingToken } from "@/lib/tokens";

export const metadata: Metadata = { title: "Your console — Bluepoint", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MemberConsole({
  searchParams,
}: {
  searchParams: Promise<{ rebook?: string }>;
}) {
  // "Book again" carries the expert in the URL, so the booking section can
  // open with them already chosen. Read before anything that can redirect.
  const { rebook } = await searchParams;
  const jar = await cookies();

  const customerId = await verifySession(jar.get(MEMBER_COOKIE)?.value);
  if (!customerId) redirect("/member/login");

  let data;
  try {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!customer) redirect("/member/login");

    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.customerId, customerId), eq(memberships.status, "active")))
      .orderBy(desc(memberships.endsAt))
      .limit(1);

    const upcoming = await db
      .select({
        id: bookings.id,
        startsAt: bookings.startsAt,
        status: bookings.status,
        meetingUrl: bookings.meetingUrl,
        rescheduleCount: bookings.rescheduleCount,
        expertName: experts.displayName,
        expertSlug: experts.slug,
        // Null until the form has been submitted. One row per booking.
        intakeId: intakeSubmissions.id,
      })
      .from(bookings)
      .innerJoin(experts, eq(bookings.expertId, experts.id))
      .leftJoin(intakeSubmissions, eq(intakeSubmissions.bookingId, bookings.id))
      .where(
        and(
          eq(bookings.customerId, customerId),
          eq(bookings.status, "confirmed"),
          gte(bookings.startsAt, new Date()),
        ),
      )
      .orderBy(bookings.startsAt);

    const past = await db
      .select({
        id: bookings.id,
        startsAt: bookings.startsAt,
        expertName: experts.displayName,
        expertSlug: experts.slug,
        expertNote: bookings.expertNote,
      })
      .from(bookings)
      .innerJoin(experts, eq(bookings.expertId, experts.id))
      .where(and(eq(bookings.customerId, customerId), eq(bookings.status, "completed")))
      .orderBy(desc(bookings.startsAt))
      .limit(20);

    const bookable: BookableExpert[] = membership
      ? (
          await db
            .select({
              slug: experts.slug,
              displayName: experts.displayName,
              initials: experts.initials,
              headline: experts.headline,
            })
            .from(experts)
            .where(eq(experts.status, "live"))
        ).map((e) => e)
      : [];

    const [liveBundles, record] = await Promise.all([
      liveBundlesForCustomer(customerId),
      recordForCustomer(customerId),
    ]);

    data = { customer, membership, upcoming, past, bookable, liveBundles, record };
  } catch (err) {
    rethrowIfNavigation(err);
    return (
      <div className="wrap bp-page">
        <div className="logo bp-page-logo">
          blue<span>point</span>
        </div>
        <div className="bp-panel">
          <h1>Not available right now</h1>
          <p className="bp-muted">We could not reach your account. Please try again shortly.</p>
        </div>
      </div>
    );
  }

  const { customer, membership, upcoming, past, bookable, liveBundles, record } = data;
  const daysLeft = membership
    ? Math.max(0, Math.ceil((membership.endsAt.getTime() - Date.now()) / 86_400_000))
    : 0;

  /*
   * Where "Book again" goes depends on what the member already holds,
   * because the profile page's booking always charges the single-call
   * price. Sending a pass holder there would bill them for a session their
   * pass already covers. So: a live bundle with this expert first, then the
   * pass booking on this page with the expert pre-selected, and only
   * somebody paying per call is sent to the profile.
   */
  const rebookHref = (slug: string): string => {
    const bundle = liveBundles.find((b) => b.expertSlug === slug && b.creditsLeft > 0);
    if (bundle) return `#bundle-${bundle.id}`;
    if (membership) return `/member?rebook=${slug}#book`;
    return `/experts/${slug}`;
  };

  return (
    <div className="wrap bp-page member">
      <div className="os-bar">
        <a href="/" className="logo os-mark">
          blue<span>point</span> <em>os</em>
        </a>
        <span className="os-nav">
          <a href="/member/receipts">Receipts</a>
          <a href="/member/profile">Your details</a>
        </span>
      </div>

      {/*
        A status line rather than a greeting: what you hold, and how long it
        has left. Real values, in a mono so the day count does not shift the
        line as it counts down.
      */}
      <div className="os-status">
        <span className="os-status-user">{customer.name}</span>
        <span className="os-status-sep">/</span>
        <span className="os-status-plan">
          {membership ? MEMBERSHIP_TIERS[membership.tier].label : "No active pass"}
        </span>
        {membership ? (
          <>
            <span className="os-status-sep">/</span>
            <span className="os-status-days">
              {daysLeft} day{daysLeft === 1 ? "" : "s"} remaining
            </span>
          </>
        ) : null}
      </div>

      {membership ? (
        <div className="member-pass">
          <div>
            <p className="member-pass-label">{MEMBERSHIP_TIERS[membership.tier].label}</p>
            <p className="member-pass-main">Unlimited sessions</p>
            <p className="member-pass-sub">
              Active until {istDateTime(membership.endsAt)} IST · {daysLeft} day
              {daysLeft === 1 ? "" : "s"} left
            </p>
          </div>
          <span className="pill ok big">active</span>
        </div>
      ) : (
        <div className="bp-panel">
          <h1>No active pass</h1>
          <p className="bp-muted">
            Your sessions and history are below. Book a single call any time, or pick up a
            quarterly or annual pass to stop paying per call.
          </p>
          {/*
            Two routes, because somebody without a pass wants both and until
            now had neither: this panel offered only "see passes", and pointed
            it at /#pricing — an anchor that stopped existing when the home
            page's packages section was renamed. It landed them at the top of
            the home page.
          */}
          <div className="member-nopass-actions">
            <a className="btn-primary" href="/experts">
              Find an expert
            </a>
            <a className="ops-link" href="/#ways">
              See the passes
            </a>
          </div>
        </div>
      )}

      {upcoming.length > 0 ? (
        <section className="member-section">
          <h2 className="member-h2">Coming up</h2>
          <ul className="member-list">
            {upcoming.map((b) => (
              <li key={b.id} className="member-upcoming">
                <div className="member-upcoming-top">
                  <div>
                    <b>{istDateTime(b.startsAt)} IST</b>
                    <span className="ops-sub">{b.expertName}</span>
                  </div>
                  <span className="member-list-right">
                    {b.meetingUrl ? (
                      <a className="ops-link" href={b.meetingUrl}>
                        Join
                      </a>
                    ) : null}
                    <a className="ops-link" href={`/booking/${b.id}`}>
                      Details
                    </a>
                  </span>
                </div>
                {/*
                  The intake was reachable only from the confirmation email.
                  Lose the email and there was no way to tell your expert what
                  you hold — and them reading it beforehand is the premise of
                  the session. The console knows this is the member's own
                  booking, so it can mint the same signed link the email did.
                */}
                <p className="member-intake">
                  {b.intakeId ? (
                    <>
                      <span className="pill ok">intake sent</span>
                      <span className="bp-muted">
                        {b.expertName.split(" ")[0]} has what you shared.
                      </span>
                      <a
                        className="ops-link"
                        href={`/booking/${b.id}/intake?t=${signBookingToken(b.id)}`}
                      >
                        Update it
                      </a>
                    </>
                  ) : (
                    <>
                      <span className="pill warn">intake not sent</span>
                      <span className="bp-muted">
                        {b.expertName.split(" ")[0]} reads it before the call.
                      </span>
                      <a
                        className="ops-link"
                        href={`/booking/${b.id}/intake?t=${signBookingToken(b.id)}`}
                      >
                        Tell them what you hold
                      </a>
                    </>
                  )}
                </p>
                <ManageBooking
                  bookingId={b.id}
                  startsAt={b.startsAt.toISOString()}
                  expertSlug={b.expertSlug}
                  rescheduleCount={b.rescheduleCount}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {membership ? (
        <section className="member-section" id="book">
          <h2 className="member-h2">Book a session</h2>
          <p className="bp-muted" style={{ marginBottom: 14 }}>
            Included in your pass — any expert, as often as you like. Or{" "}
            <a className="ops-link" href="/experts">
              browse everyone
            </a>{" "}
            to compare background and availability first.
          </p>
          <MemberBooking experts={bookable} initialSlug={rebook} />
        </section>
      ) : null}

      {/*
        Bundles were invisible here until now: a three-call buyer could sign in
        and had no way to book calls two and three. Each live bundle gets its
        own picker, locked to the expert it was bought against.
      */}
      {liveBundles.map((b) => (
        <section className="member-section" key={b.id} id={`bundle-${b.id}`}>
          <h2 className="member-h2">
            {b.creditsLeft} of {b.creditsTotal} calls left
            {b.expertName ? ` with ${b.expertName}` : ""}
          </h2>
          <p className="bp-muted" style={{ marginBottom: 14 }}>
            Already paid for. Valid until {istDateTime(b.expiresAt)} IST.
          </p>
          <MemberBooking
            bundleId={b.id}
            experts={
              b.expertSlug
                ? [
                    {
                      slug: b.expertSlug,
                      displayName: b.expertName ?? "Your expert",
                      initials: b.expertInitials ?? "??",
                      headline: b.expertHeadline ?? "",
                    },
                  ]
                : []
            }
          />
        </section>
      ))}

      {/*
        A pass is bought outright rather than auto-renewed, so this prompt is
        the renewal mechanism. It carries what the sessions would have cost one
        at a time, because that is the number the decision actually turns on —
        including when it is unflattering.
      */}
      {membership && daysLeft <= RENEWAL_WINDOW_DAYS ? (
        <section className="member-section">
          <div className="os-renew">
            <div>
              <h2 className="member-h2">
                Your pass ends in {daysLeft} day{daysLeft === 1 ? "" : "s"}
              </h2>
              <p className="bp-muted">
                {record.sessionsTaken > 0 ? (
                  <>
                    You have taken {record.sessionsTaken} session
                    {record.sessionsTaken === 1 ? "" : "s"} on it. One at a time those would have
                    cost {rupees(record.atSingleCallPaise)}.
                  </>
                ) : (
                  <>You have not used it yet. Book something before it lapses.</>
                )}
              </p>
            </div>
            <PassPurchase
              tier={membership.tier}
              label={MEMBERSHIP_TIERS[membership.tier].label}
              priceLabel={rupees(MEMBERSHIP_TIERS[membership.tier].pricePaise)}
              cta="Renew"
              className="btn-primary"
            />
          </div>
        </section>
      ) : null}

      {/*
        The record. It states what was DECLARED and what was DISCUSSED — never
        what was recommended, and never that a change followed advice. The terms
        say Bluepoint does not give personalised advice, and this has to agree.
      */}
      {record.movements.length > 0 ? (
        <section className="member-section">
          <h2 className="member-h2">The Log</h2>
          <p className="bp-muted" style={{ marginBottom: 14 }}>
            A log is what you keep of successive positions. This is yours: what you told us
            you held, first session against most recent, in your own figures.
          </p>
          <ul className="os-moves">
            {record.movements.map((m) => (
              <li key={m.label}>
                <span className="os-move-label">{m.label}</span>
                <span className="os-move-nums">
                  <b>{m.first}%</b>
                  <span className="os-move-arrow">→</span>
                  <b>{m.latest}%</b>
                  <span className={`os-move-delta${m.delta === 0 ? " flat" : ""}`}>
                    {m.delta > 0 ? "+" : ""}
                    {m.delta}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section className="member-section">
          <h2 className="member-h2">Past sessions</h2>
          <ul className="member-list">
            {past.map((b) => (
              <li key={b.id} className="member-past">
                <div className="member-past-top">
                  <div>
                    <b>{istDateTime(b.startsAt)} IST</b>
                    <span className="ops-sub">{b.expertName}</span>
                  </div>
                  <span className="member-list-right">
                    <a className="ops-link" href={`/booking/${b.id}`}>
                      What you shared
                    </a>
                    <a className="ops-link" href={rebookHref(b.expertSlug)}>
                      {`Book ${b.expertName.split(" ")[0]} again`}
                    </a>
                  </span>
                </div>
                {/*
                  Framed as what was discussed, matching how the expert was
                  asked to write it and what the terms commit to. It is an
                  account of a conversation, not advice given.
                */}
                {b.expertNote ? (
                  <div className="member-note">
                    <span className="member-note-label">
                      {b.expertName.split(" ")[0]} noted
                    </span>
                    <p>{b.expertNote}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
