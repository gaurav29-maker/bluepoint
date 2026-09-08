import Link from "next/link";
import { and, asc, count, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, bundles, customers, experts, intakeSubmissions } from "@/lib/db/schema";
import { istDateTime, rupees } from "@/lib/format";
import NoDatabase from "@/components/ops/NoDatabase";
import { occupiesSlot } from "@/lib/bookings";

export const dynamic = "force-dynamic";

type Overview = {
  upcoming: number;
  awaitingPayment: number;
  missingIntake: number;
  activeBundles: number;
  next: {
    id: string;
    startsAt: Date;
    status: string;
    expertName: string;
    customerName: string;
    customerEmail: string;
    amountPaise: number;
    hasIntake: boolean;
  }[];
};

async function load(): Promise<Overview | null> {
  try {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [[upcoming], [awaiting], [needIntake], [activeBundles]] = await Promise.all([
      db
        .select({ n: count() })
        .from(bookings)
        .where(and(eq(bookings.status, "confirmed"), gte(bookings.startsAt, now))),
      db.select({ n: count() }).from(bookings).where(and(eq(bookings.status, "held"), occupiesSlot())),
      db
        .select({ n: count() })
        .from(bookings)
        .leftJoin(intakeSubmissions, eq(intakeSubmissions.bookingId, bookings.id))
        .where(
          and(
            eq(bookings.status, "confirmed"),
            gte(bookings.startsAt, now),
            isNull(intakeSubmissions.id),
          ),
        ),
      db.select({ n: count() }).from(bundles).where(eq(bundles.status, "active")),
    ]);

    const next = await db
      .select({
        id: bookings.id,
        startsAt: bookings.startsAt,
        status: bookings.status,
        amountPaise: bookings.amountPaise,
        expertName: experts.displayName,
        customerName: customers.name,
        customerEmail: customers.email,
        intakeId: intakeSubmissions.id,
      })
      .from(bookings)
      .innerJoin(experts, eq(bookings.expertId, experts.id))
      .innerJoin(customers, eq(bookings.customerId, customers.id))
      .leftJoin(intakeSubmissions, eq(intakeSubmissions.bookingId, bookings.id))
      .where(
        and(
          eq(bookings.status, "confirmed"),
          gte(bookings.startsAt, now),
          lte(bookings.startsAt, in7),
        ),
      )
      .orderBy(asc(bookings.startsAt))
      .limit(12);

    return {
      upcoming: upcoming?.n ?? 0,
      awaitingPayment: awaiting?.n ?? 0,
      missingIntake: needIntake?.n ?? 0,
      activeBundles: activeBundles?.n ?? 0,
      next: next.map((r) => ({ ...r, hasIntake: r.intakeId !== null })),
    };
  } catch {
    return null;
  }
}

export default async function OpsOverview() {
  const data = await load();
  if (!data) return <NoDatabase />;

  return (
    <>
      <h1 className="ops-h1">Overview</h1>

      <div className="ops-tiles">
        <div className="ops-tile">
          <p className="ops-tile-n">{data.upcoming}</p>
          <p className="ops-tile-l">Upcoming calls</p>
        </div>
        <div className={`ops-tile${data.missingIntake > 0 ? " is-warn" : ""}`}>
          <p className="ops-tile-n">{data.missingIntake}</p>
          <p className="ops-tile-l">Missing intake</p>
        </div>
        <div className="ops-tile">
          <p className="ops-tile-n">{data.awaitingPayment}</p>
          <p className="ops-tile-l">Awaiting payment</p>
        </div>
        <div className="ops-tile">
          <p className="ops-tile-n">{data.activeBundles}</p>
          <p className="ops-tile-l">Active bundles</p>
        </div>
      </div>

      <h2 className="ops-h2">Next seven days</h2>

      {data.next.length === 0 ? (
        <p className="ops-muted">Nothing booked in the next week.</p>
      ) : (
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Expert</th>
                <th>Customer</th>
                <th>Intake</th>
                <th className="num">Paid</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.next.map((b) => (
                <tr key={b.id}>
                  <td className="nowrap">{istDateTime(b.startsAt)}</td>
                  <td>{b.expertName}</td>
                  <td>
                    {b.customerName}
                    <span className="ops-sub">{b.customerEmail}</span>
                  </td>
                  <td>
                    {b.hasIntake ? (
                      <span className="pill ok">in</span>
                    ) : (
                      <span className="pill warn">missing</span>
                    )}
                  </td>
                  <td className="num">{b.amountPaise > 0 ? rupees(b.amountPaise) : "bundle"}</td>
                  <td className="num">
                    <Link href={`/ops/bookings/${b.id}`} className="ops-link">
                      Open
                    </Link>
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
