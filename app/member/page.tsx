import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, customers, experts, memberships } from "@/lib/db/schema";
import { MEMBER_COOKIE, verifySession } from "@/lib/member-auth";
import { MEMBERSHIP_TIERS, RENEWAL_WINDOW_DAYS } from "@/lib/constants";
import { istDateTime, rupees } from "@/lib/format";
import MemberBooking, { type BookableExpert } from "@/components/member/MemberBooking";
import { liveBundlesForCustomer, recordForCustomer } from "@/lib/record";
import PassPurchase from "@/components/PassPurchase";
import ManageBooking from "@/components/member/ManageBooking";

export const metadata: Metadata = { title: "Your console — Bluepoint", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MemberConsole() {
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
      })
      .from(bookings)
      .innerJoin(experts, eq(bookings.expertId, experts.id))
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
  } catch {
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
            Your sessions and history are below. To book without paying per call, pick up a
            quarterly or annual pass from the pricing section.
          </p>
          <a className="btn-primary" href="/#pricing">
            See passes
          </a>
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
        <section className="member-section">
          <h2 className="member-h2">Book a session</h2>
          <p className="bp-muted" style={{ marginBottom: 14 }}>
            Included in your pass — any expert, as often as you like.
          </p>
          <MemberBooking experts={bookable} />
        </section>
      ) : null}

      {/*
        Bundles were invisible here until now: a three-call buyer could sign in
        and had no way to book calls two and three. Each live bundle gets its
        own picker, locked to the expert it was bought against.
      */}
      {liveBundles.map((b) => (
        <section className="member-section" key={b.id}>
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
          <h2 className="member-h2">Your position, then and now</h2>
          <p className="bp-muted" style={{ marginBottom: 14 }}>
            What you told us you held, first session against most recent. Your own figures.
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
              <li key={b.id}>
                <div>
                  <b>{istDateTime(b.startsAt)} IST</b>
                  <span className="ops-sub">{b.expertName}</span>
                </div>
                <span className="member-list-right">
                  <a className="ops-link" href={`/booking/${b.id}`}>
                    What you shared
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
