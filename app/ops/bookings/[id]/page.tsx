import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bookings,
  bundles,
  consents,
  customers,
  experts,
  intakeSubmissions,
  notifications,
  payments,
} from "@/lib/db/schema";
import { istDateTime, rupees } from "@/lib/format";
import NoDatabase from "@/components/ops/NoDatabase";
import ConfirmButton from "@/components/ops/ConfirmButton";
import { cancelBooking, markComplete, refundBooking } from "../../actions";

export const dynamic = "force-dynamic";

type Intake = {
  holdingsSummary?: string;
  goals?: string;
  experienceYears?: number;
  riskComfort?: string;
  tradesFno?: boolean;
  questions?: string;
};

async function load(id: string) {
  try {
    const [row] = await db
      .select({ booking: bookings, expert: experts, customer: customers })
      .from(bookings)
      .innerJoin(experts, eq(bookings.expertId, experts.id))
      .innerJoin(customers, eq(bookings.customerId, customers.id))
      .where(eq(bookings.id, id))
      .limit(1);

    if (!row) return { missing: true as const };

    const [intake, pays, consent, notes, bundle] = await Promise.all([
      db.select().from(intakeSubmissions).where(eq(intakeSubmissions.bookingId, id)).limit(1),
      db.select().from(payments).where(eq(payments.bookingId, id)),
      db.select().from(consents).where(eq(consents.bookingId, id)).limit(1),
      db.select().from(notifications).where(eq(notifications.bookingId, id)),
      row.booking.bundleId
        ? db.select().from(bundles).where(eq(bundles.id, row.booking.bundleId)).limit(1)
        : Promise.resolve([]),
    ]);

    return {
      missing: false as const,
      ...row,
      intake: intake[0] ?? null,
      payments: pays,
      consent: consent[0] ?? null,
      notifications: notes,
      bundle: bundle[0] ?? null,
    };
  } catch {
    return null;
  }
}

export default async function OpsBooking({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await load(id);

  if (data === null) return <NoDatabase />;
  if (data.missing) notFound();

  const { booking, expert, customer, intake, consent, bundle } = data;
  const captured = data.payments.find((p) => p.status === "captured");
  const payload = (intake?.payload ?? {}) as Intake;
  const purged = Boolean(intake?.purgedAt);

  return (
    <>
      <p className="ops-crumb">
        <Link href="/ops/bookings" className="ops-link">
          ← Bookings
        </Link>
      </p>

      <div className="ops-head">
        <div>
          <h1 className="ops-h1">{istDateTime(booking.startsAt)} IST</h1>
          <p className="ops-muted">
            {expert.displayName} · {customer.name} &lt;{customer.email}&gt;
            {customer.phone ? ` · ${customer.phone}` : ""}
          </p>
        </div>
        <span className={`pill s-${booking.status} big`}>{booking.status}</span>
      </div>

      <div className="ops-cols">
        <section className="ops-panel">
          <h2 className="ops-h2">Intake</h2>
          {purged ? (
            <p className="ops-muted">
              Purged on {istDateTime(intake!.purgedAt!)} under the 90-day retention rule.
            </p>
          ) : !intake ? (
            <p className="ops-muted">Not submitted yet.</p>
          ) : (
            <dl className="ops-dl">
              <dt>Holdings</dt>
              <dd className="pre">{payload.holdingsSummary ?? "—"}</dd>
              <dt>Wants from the call</dt>
              <dd className="pre">{payload.goals || "—"}</dd>
              <dt>Years investing</dt>
              <dd>{payload.experienceYears ?? "—"}</dd>
              <dt>Risk comfort</dt>
              <dd>{payload.riskComfort ?? "—"}</dd>
              <dt>Trades F&amp;O</dt>
              <dd>{payload.tradesFno ? "yes" : "no"}</dd>
              <dt>Questions</dt>
              <dd className="pre">{payload.questions || "—"}</dd>
            </dl>
          )}
        </section>

        <section className="ops-panel">
          <h2 className="ops-h2">Money</h2>
          <dl className="ops-dl">
            <dt>Product</dt>
            <dd>{booking.product === "bundle_call" ? "Bundle call" : "Single call"}</dd>
            <dt>Booking amount</dt>
            <dd>{booking.amountPaise > 0 ? rupees(booking.amountPaise) : "covered by bundle"}</dd>
            {bundle ? (
              <>
                <dt>Bundle</dt>
                <dd>
                  {rupees(bundle.amountPaise)} · {bundle.creditsUsed}/{bundle.creditsTotal} used ·{" "}
                  {bundle.status}
                </dd>
              </>
            ) : null}
            <dt>Payments</dt>
            <dd>
              {data.payments.length === 0
                ? "none"
                : data.payments.map((p) => (
                    <span key={p.id} className="ops-payline">
                      {rupees(p.amountPaise)} · {p.status} ·{" "}
                      <code>{p.razorpayPaymentId ?? p.razorpayOrderId}</code>
                    </span>
                  ))}
            </dd>
            <dt>Disclaimer</dt>
            <dd>
              {consent
                ? `v${consent.disclaimerVersion}, ${istDateTime(consent.acceptedAt)}`
                : "not recorded"}
            </dd>
            <dt>Emails sent</dt>
            <dd>
              {data.notifications.length === 0
                ? "none"
                : data.notifications.map((n) => n.kind).join(", ")}
            </dd>
          </dl>
        </section>
      </div>

      <section className="ops-panel">
        <h2 className="ops-h2">Actions</h2>
        <div className="ops-actions">
          {booking.status === "confirmed" ? (
            <form action={markComplete}>
              <input type="hidden" name="bookingId" value={booking.id} />
              <button className="ops-btn" type="submit">
                Mark completed
              </button>
            </form>
          ) : null}

          {["held", "confirmed"].includes(booking.status) ? (
            <form action={cancelBooking} className="ops-inline">
              <input type="hidden" name="bookingId" value={booking.id} />
              <input name="reason" placeholder="Reason" className="ops-input" />
              <ConfirmButton
                className="ops-btn"
                message="Cancel this booking? This frees the slot and does not move any money."
              >
                Cancel booking
              </ConfirmButton>
            </form>
          ) : null}

          {captured ? (
            <form action={refundBooking} className="ops-inline">
              <input type="hidden" name="bookingId" value={booking.id} />
              <input name="reason" placeholder="Reason" className="ops-input" />
              <ConfirmButton
                className="ops-btn danger"
                message={`Refund ${rupees(captured.amountPaise)} to ${customer.email}? This moves real money and cannot be undone here.`}
              >
                Refund {rupees(captured.amountPaise)}
              </ConfirmButton>
            </form>
          ) : null}
        </div>
        {booking.cancelledReason ? (
          <p className="ops-muted ops-foot">Reason on file: {booking.cancelledReason}</p>
        ) : null}
      </section>
    </>
  );
}
