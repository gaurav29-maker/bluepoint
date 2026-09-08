import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { MEMBER_COOKIE, verifySession } from "@/lib/member-auth";
import { receiptsForCustomer } from "@/lib/receipts";
import { istDateTime, rupees } from "@/lib/format";

export const metadata: Metadata = { title: "Receipts — Bluepoint", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Receipts() {
  const customerId = await verifySession((await cookies()).get(MEMBER_COOKIE)?.value);
  if (!customerId) redirect("/member/login");

  let rows;
  let name = "";
  try {
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!customer) redirect("/member/login");
    name = customer.name;
    rows = await receiptsForCustomer(customerId);
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

  return (
    <div className="wrap bp-page member">
      <div className="member-top">
        <Link href="/member" className="logo bp-page-logo">
          blue<span>point</span>
        </Link>
        <span className="bp-muted">{name}</span>
      </div>

      <p className="ops-crumb">
        <Link href="/member" className="ops-link">
          ← Your console
        </Link>
      </p>

      <h1 className="ops-h1">Receipts</h1>
      <p className="bp-muted ops-lede">Everything you have paid for, most recent first.</p>

      {rows.length === 0 ? (
        <p className="bp-muted">Nothing yet.</p>
      ) : (
        <ul className="member-list">
          {rows.map((r) => (
            <li key={r.id}>
              <div>
                <b>{r.description}</b>
                <span className="ops-sub">
                  {istDateTime(r.paidAt)} · {r.reference}
                  {r.status === "refunded" ? " · refunded" : ""}
                </span>
              </div>
              <span className="member-list-right">
                <b>{rupees(r.amountPaise)}</b>
                <Link className="ops-link" href={`/member/receipts/${r.id}`}>
                  View
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="bp-fineprint" style={{ textAlign: "left", marginTop: 24 }}>
        These are payment receipts. A GST tax invoice is a separate document and is not issued yet.
      </p>
    </div>
  );
}
