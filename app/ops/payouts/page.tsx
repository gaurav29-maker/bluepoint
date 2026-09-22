import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, expertPayouts, experts } from "@/lib/db/schema";
import { istDateTime, rupees } from "@/lib/format";
import { rethrowIfNavigation } from "@/lib/nav";
import { markPayoutsPaid } from "../actions";

export const dynamic = "force-dynamic";

/**
 * What is owed to whom, and the button that says it has been sent.
 *
 * Deliberately not a payments integration. Landline does not move money to
 * experts automatically — somebody makes a bank transfer and records it here
 * with its reference. A ledger that claims to have paid people is worse than
 * no ledger, so the only thing this page asserts is what a human tells it.
 */
export default async function OpsPayouts() {
  let owed: {
    expertId: string;
    name: string;
    slug: string;
    pendingPaise: number;
    sessions: number;
    oldest: Date | null;
  }[] = [];
  let recent: {
    id: string;
    name: string;
    amountPaise: number;
    status: string;
    reference: string | null;
    note: string | null;
    paidAt: Date | null;
    startsAt: Date;
  }[] = [];
  let dbReady = true;

  try {
    owed = await db
      .select({
        expertId: experts.id,
        name: experts.displayName,
        slug: experts.slug,
        pendingPaise: sql<number>`coalesce(sum(${expertPayouts.amountPaise}), 0)::int`,
        sessions: sql<number>`count(*)::int`,
        oldest: sql<Date | null>`min(${bookings.startsAt})`,
      })
      .from(expertPayouts)
      .innerJoin(experts, eq(expertPayouts.expertId, experts.id))
      .innerJoin(bookings, eq(expertPayouts.bookingId, bookings.id))
      .where(eq(expertPayouts.status, "pending"))
      .groupBy(experts.id, experts.displayName, experts.slug)
      .orderBy(desc(sql`sum(${expertPayouts.amountPaise})`));

    recent = await db
      .select({
        id: expertPayouts.id,
        name: experts.displayName,
        amountPaise: expertPayouts.amountPaise,
        status: expertPayouts.status,
        reference: expertPayouts.reference,
        note: expertPayouts.note,
        paidAt: expertPayouts.paidAt,
        startsAt: bookings.startsAt,
      })
      .from(expertPayouts)
      .innerJoin(experts, eq(expertPayouts.expertId, experts.id))
      .innerJoin(bookings, eq(expertPayouts.bookingId, bookings.id))
      .where(inArray(expertPayouts.status, ["paid", "void"]))
      .orderBy(desc(expertPayouts.updatedAt))
      .limit(25);
  } catch (err) {
    rethrowIfNavigation(err);
    dbReady = false;
  }

  const totalOwed = owed.reduce((sum, o) => sum + o.pendingPaise, 0);

  return (
    <>
      <h1 className="ops-h1">Payouts</h1>
      <p className="bp-muted ops-lede">
        What each expert has earned and not yet been paid. Landline does not transfer money —
        make the bank transfer, then record it here with its reference so the ledger and the
        bank agree.
      </p>

      {!dbReady ? (
        <p className="band-empty">Could not reach the database.</p>
      ) : owed.length === 0 ? (
        <p className="band-empty">Nothing outstanding. Every completed session has been paid.</p>
      ) : (
        <>
          <p className="ops-total">
            <b>{rupees(totalOwed)}</b> outstanding across {owed.length} expert
            {owed.length === 1 ? "" : "s"}
          </p>

          <table className="ops-table">
            <thead>
              <tr>
                <th>Expert</th>
                <th>Sessions</th>
                <th>Owed</th>
                <th>Oldest</th>
                <th>Mark paid</th>
              </tr>
            </thead>
            <tbody>
              {owed.map((o) => (
                <tr key={o.expertId}>
                  <td>{o.name}</td>
                  <td>{o.sessions}</td>
                  <td className="ops-num">{rupees(o.pendingPaise)}</td>
                  <td>{o.oldest ? istDateTime(new Date(o.oldest)) : "—"}</td>
                  <td>
                    {/*
                      Settles everything pending for this expert at once, which
                      is how a bank transfer actually works — one payment, many
                      sessions. The reference ties the row back to it.
                    */}
                    <form action={markPayoutsPaid} className="ops-inline">
                      <input type="hidden" name="expertId" value={o.expertId} />
                      <input
                        name="reference"
                        className="ops-input"
                        placeholder="UTR or reference"
                        required
                      />
                      <button className="ops-btn" type="submit">
                        Paid {rupees(o.pendingPaise)}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {recent.length > 0 ? (
        <section className="ops-section">
          <h2 className="ops-h2">Settled and void</h2>
          <table className="ops-table">
            <thead>
              <tr>
                <th>Expert</th>
                <th>Session</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{istDateTime(r.startsAt)}</td>
                  <td className="ops-num">{rupees(r.amountPaise)}</td>
                  <td>
                    <span className={`pill s-${r.status}`}>{r.status}</span>
                  </td>
                  <td className="ops-sub">{r.reference ?? r.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
