import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, customers, memberships } from "@/lib/db/schema";
import { istDateTime, rupees } from "@/lib/format";
import { EXPERT_PAYOUT_PAISE, MEMBERSHIP_TIERS } from "@/lib/constants";
import NoDatabase from "@/components/ops/NoDatabase";

export const dynamic = "force-dynamic";

/**
 * The instrument that replaces the throttle.
 *
 * Passes are unlimited by decision, so nothing in the code stops a member
 * taking three calls a week. What stops it costing more than it earns is
 * seeing it here, before the renewal, rather than inferring it from a bank
 * balance afterwards.
 */
async function load() {
  try {
    const rows = await db
      .select({ membership: memberships, customer: customers })
      .from(memberships)
      .innerJoin(customers, eq(memberships.customerId, customers.id))
      .orderBy(desc(memberships.createdAt))
      .limit(200);

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.membership.id);
    const counts = await db
      .select({ membershipId: bookings.membershipId, n: sql<number>`count(*)::int` })
      .from(bookings)
      .where(
        and(
          inArray(bookings.membershipId, ids),
          inArray(bookings.status, ["confirmed", "completed"]),
        ),
      )
      .groupBy(bookings.membershipId);

    const used = new Map<string, number>();
    for (const c of counts) if (c.membershipId) used.set(c.membershipId, c.n);

    return rows.map(({ membership, customer }) => {
      const calls = used.get(membership.id) ?? 0;
      const cost = calls * EXPERT_PAYOUT_PAISE;
      const margin = membership.amountPaise - cost;
      const daysLeft = Math.max(
        0,
        Math.ceil((membership.endsAt.getTime() - Date.now()) / 86_400_000),
      );
      const breakEven = Math.floor(membership.amountPaise / EXPERT_PAYOUT_PAISE);
      return { membership, customer, calls, cost, margin, daysLeft, breakEven };
    });
  } catch {
    return null;
  }
}

export default async function OpsMembers() {
  const rows = await load();
  if (rows === null) return <NoDatabase />;

  const active = rows.filter((r) => r.membership.status === "active");
  const underwater = active.filter((r) => r.margin < 0);
  const collected = active.reduce((n, r) => n + r.membership.amountPaise, 0);
  const spent = active.reduce((n, r) => n + r.cost, 0);

  return (
    <>
      <h1 className="ops-h1">Members</h1>
      <p className="ops-muted ops-lede">
        Passes are unlimited, so usage is not capped anywhere in the code. This page is where a
        member who costs more than they pay becomes visible — ideally before their renewal.
        Expert cost is estimated at {rupees(EXPERT_PAYOUT_PAISE)} a session; set{" "}
        <code>EXPERT_PAYOUT_PAISE</code> to the real figure or every number here is a guess.
      </p>

      <div className="ops-tiles">
        <div className="ops-tile">
          <p className="ops-tile-n">{active.length}</p>
          <p className="ops-tile-l">Active passes</p>
        </div>
        <div className={`ops-tile${underwater.length > 0 ? " is-warn" : ""}`}>
          <p className="ops-tile-n">{underwater.length}</p>
          <p className="ops-tile-l">Costing more than paid</p>
        </div>
        <div className="ops-tile">
          <p className="ops-tile-n">{rupees(collected)}</p>
          <p className="ops-tile-l">Collected, active</p>
        </div>
        <div className="ops-tile">
          <p className="ops-tile-n">{rupees(collected - spent)}</p>
          <p className="ops-tile-l">Margin so far</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="ops-muted">Nobody has bought a pass yet.</p>
      ) : (
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Tier</th>
                <th>Status</th>
                <th>Runs to</th>
                <th className="num">Paid</th>
                <th className="num">Calls</th>
                <th className="num">Break-even</th>
                <th className="num">Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.membership.id}>
                  <td>
                    {r.customer.name}
                    <span className="ops-sub">{r.customer.email}</span>
                  </td>
                  <td>{MEMBERSHIP_TIERS[r.membership.tier].label}</td>
                  <td>
                    <span className={`pill s-${r.membership.status === "active" ? "live" : "cancelled"}`}>
                      {r.membership.status}
                    </span>
                  </td>
                  <td className="nowrap">
                    {istDateTime(r.membership.endsAt)}
                    <span className="ops-sub">{r.daysLeft} days left</span>
                  </td>
                  <td className="num">{rupees(r.membership.amountPaise)}</td>
                  <td className="num">{r.calls}</td>
                  <td className="num">{r.breakEven}</td>
                  <td className="num">
                    <span className={`pill ${r.margin < 0 ? "s-refunded" : "ok"}`}>
                      {r.margin < 0 ? "−" : ""}
                      {rupees(Math.abs(r.margin))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
