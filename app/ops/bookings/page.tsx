import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, customers, experts, intakeSubmissions } from "@/lib/db/schema";
import { istDateTime, rupees } from "@/lib/format";
import NoDatabase from "@/components/ops/NoDatabase";

export const dynamic = "force-dynamic";

const STATUSES = [
  "all",
  "confirmed",
  "completed",
  "held",
  "cancelled",
  "refunded",
  "expired",
] as const;

type Status = (typeof STATUSES)[number];

async function load(status: Status) {
  try {
    const base = db
      .select({
        id: bookings.id,
        startsAt: bookings.startsAt,
        status: bookings.status,
        product: bookings.product,
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
      .orderBy(desc(bookings.startsAt))
      .limit(200);

    return status === "all"
      ? await base
      : await base.where(eq(bookings.status, status));
  } catch {
    return null;
  }
}

export default async function OpsBookings({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active: Status = (STATUSES as readonly string[]).includes(status ?? "")
    ? (status as Status)
    : "all";

  const rows = await load(active);
  if (rows === null) return <NoDatabase />;

  return (
    <>
      <h1 className="ops-h1">Bookings</h1>

      <div className="ops-filters">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/ops/bookings" : `/ops/bookings?status=${s}`}
            className={`ops-filter${s === active ? " is-active" : ""}`}
          >
            {s}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="ops-muted">Nothing with that status.</p>
      ) : (
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Status</th>
                <th>Expert</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Intake</th>
                <th className="num">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="nowrap">{istDateTime(b.startsAt)}</td>
                  <td>
                    <span className={`pill s-${b.status}`}>{b.status}</span>
                  </td>
                  <td>{b.expertName}</td>
                  <td>
                    {b.customerName}
                    <span className="ops-sub">{b.customerEmail}</span>
                  </td>
                  <td>{b.product === "bundle_call" ? "bundle" : "single"}</td>
                  <td>
                    {b.intakeId ? (
                      <span className="pill ok">in</span>
                    ) : (
                      <span className="pill muted">—</span>
                    )}
                  </td>
                  <td className="num">{b.amountPaise > 0 ? rupees(b.amountPaise) : "—"}</td>
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

      <p className="ops-muted ops-foot">
        Showing the {rows.length === 200 ? "most recent 200" : `${rows.length}`} by start time.
      </p>
    </>
  );
}
