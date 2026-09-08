import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { MEMBER_COOKIE, verifySession } from "@/lib/member-auth";
import { receiptForCustomer } from "@/lib/receipts";
import { istDateTime, rupees } from "@/lib/format";
import PrintButton from "@/components/member/PrintButton";

export const metadata: Metadata = { title: "Receipt — Bluepoint", robots: { index: false } };
export const dynamic = "force-dynamic";

const TODO = ({ children }: { children: React.ReactNode }) => (
  <span className="legal-todo">{children}</span>
);

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customerId = await verifySession((await cookies()).get(MEMBER_COOKIE)?.value);
  if (!customerId) redirect("/member/login");

  let customer;
  let receipt;
  try {
    [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!customer) redirect("/member/login");
    // Scoped to this customer, so one member cannot read another's receipt by id.
    receipt = await receiptForCustomer(customerId, id);
  } catch {
    return (
      <div className="wrap bp-page member">
        <div className="bp-panel">
          <h1>Not available right now</h1>
          <p className="bp-muted">We could not reach your account. Please try again shortly.</p>
        </div>
      </div>
    );
  }

  if (!receipt) notFound();

  return (
    <div className="wrap bp-page member">
      <p className="ops-crumb no-print">
        <Link href="/member/receipts" className="ops-link">
          ← Receipts
        </Link>
      </p>

      <article className="receipt">
        <header className="receipt-head">
          <div>
            <p className="logo receipt-logo">
              blue<span>point</span>
            </p>
            <p className="receipt-issuer">
              <TODO>[registered entity name]</TODO>
              <br />
              <TODO>[registered address]</TODO>
              <br />
              <TODO>[GSTIN, once registered]</TODO>
            </p>
          </div>
          <div className="receipt-meta">
            <p className="receipt-kind">Payment receipt</p>
            <p className="receipt-ref">{receipt.reference}</p>
            <p className="receipt-date">{istDateTime(receipt.paidAt)} IST</p>
            {receipt.status === "refunded" ? (
              <p className="pill s-refunded">refunded</p>
            ) : (
              <p className="pill ok">paid</p>
            )}
          </div>
        </header>

        <section className="receipt-to">
          <p className="receipt-label">Billed to</p>
          <p>
            <b>{customer.name}</b>
            <br />
            {customer.email}
            {customer.phone ? (
              <>
                <br />
                {customer.phone}
              </>
            ) : null}
          </p>
        </section>

        <table className="receipt-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{receipt.description}</td>
              <td className="num">{rupees(receipt.amountPaise)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>
                <b>{receipt.status === "refunded" ? "Refunded" : "Total paid"}</b>
              </td>
              <td className="num">
                <b>{rupees(receipt.amountPaise)}</b>
              </td>
            </tr>
          </tfoot>
        </table>

        <section className="receipt-refs">
          <p className="receipt-label">Payment reference</p>
          <p>
            <code>{receipt.razorpayPaymentId ?? receipt.razorpayOrderId}</code>
            <br />
            Paid through Razorpay. Bluepoint does not see or store your card, UPI or netbanking
            details.
          </p>
        </section>

        <footer className="receipt-foot">
          <p>
            <b>This is a payment receipt, not a tax invoice.</b> A GST invoice requires a GSTIN,
            place of supply and a sequential invoice number, none of which apply yet. When Bluepoint
            is registered, invoices will be issued separately and this receipt does not replace one.
          </p>
        </footer>
      </article>

      <div className="no-print receipt-actions">
        <PrintButton />
      </div>
    </div>
  );
}
