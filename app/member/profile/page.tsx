import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, ne, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { MEMBER_COOKIE, mintEmailChange, verifySession } from "@/lib/member-auth";
import { emailChangeConfirm, sendRaw } from "@/lib/email";

export const metadata: Metadata = { title: "Your details — Bluepoint", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Profile({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; sent?: string; changed?: string; error?: string }>;
}) {
  const { saved, sent, changed, error } = await searchParams;

  const customerId = await verifySession((await cookies()).get(MEMBER_COOKIE)?.value);
  if (!customerId) redirect("/member/login");

  let customer;
  try {
    [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!customer) redirect("/member/login");
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

  async function saveDetails(formData: FormData) {
    "use server";
    const id = await verifySession((await cookies()).get(MEMBER_COOKIE)?.value);
    if (!id) redirect("/member/login");

    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();

    if (name.length < 1 || name.length > 120) {
      redirect("/member/profile?error=name");
    }
    if (phone.length > 20) redirect("/member/profile?error=phone");

    await db
      .update(customers)
      .set({ name, phone: phone === "" ? null : phone })
      .where(eq(customers.id, id));

    redirect("/member/profile?saved=1");
  }

  async function requestEmailChange(formData: FormData) {
    "use server";
    const id = await verifySession((await cookies()).get(MEMBER_COOKIE)?.value);
    if (!id) redirect("/member/login");

    const next = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!/.+@.+\..+/.test(next) || next.length > 200) {
      redirect("/member/profile?error=email");
    }

    const [me] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!me) redirect("/member/login");
    if (me.email.toLowerCase() === next) redirect("/member/profile?error=same");

    // Taken addresses are checked here AND again on confirm — someone else
    // could claim it in between.
    const [clash] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(sql`lower(${customers.email}) = ${next}`, ne(customers.id, id)))
      .limit(1);

    // The same answer either way, so this page cannot be used to discover
    // which addresses already have an account.
    if (!clash) {
      const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      const url = `${base}/api/member/profile/email?t=${await mintEmailChange(id, next)}`;
      try {
        // Sent to the NEW address. Confirming it is what proves it is reachable.
        await sendRaw({ to: next, ...emailChangeConfirm({ customerName: me.name, url }) });
      } catch (err) {
        console.error("[profile] email change send failed", err);
      }
    }

    redirect("/member/profile?sent=1");
  }

  return (
    <div className="wrap bp-page member">
      <div className="member-top">
        <Link href="/member" className="logo bp-page-logo">
          blue<span>point</span>
        </Link>
        <span className="bp-muted">{customer.name}</span>
      </div>

      <p className="ops-crumb">
        <Link href="/member" className="ops-link">
          ← Your console
        </Link>
      </p>

      <h1 className="ops-h1">Your details</h1>
      <p className="bp-muted ops-lede">
        What your expert sees before a call, and where confirmations are sent.
      </p>

      {saved ? <p className="member-done">Saved.</p> : null}
      {changed ? <p className="member-done">Your email address has been updated.</p> : null}
      {sent ? (
        <p className="member-done">
          If that address is available, a confirmation link is on its way to it. The change takes
          effect once you follow that link.
        </p>
      ) : null}
      {error === "name" ? <p className="bp-error">Please give a name.</p> : null}
      {error === "phone" ? <p className="bp-error">That phone number is too long.</p> : null}
      {error === "email" ? <p className="bp-error">That does not look like an email address.</p> : null}
      {error === "same" ? <p className="bp-error">That is already your email address.</p> : null}
      {error === "taken" ? (
        <p className="bp-error">That address could not be used. Try another.</p>
      ) : null}

      <section className="member-section">
        <form action={saveDetails} className="bp-panel">
          <h2 className="member-h2">Name and phone</h2>
          <label className="bp-field">
            <span>Your name</span>
            <input name="name" defaultValue={customer.name} autoComplete="name" required />
          </label>
          <label className="bp-field">
            <span>
              Phone <em>optional</em>
            </span>
            <input name="phone" defaultValue={customer.phone ?? ""} autoComplete="tel" />
          </label>
          <button className="btn-primary" type="submit">
            Save
          </button>
        </form>
      </section>

      <section className="member-section">
        <form action={requestEmailChange} className="bp-panel">
          <h2 className="member-h2">Email address</h2>
          <p className="bp-muted" style={{ marginBottom: 14 }}>
            This is how you sign in, so a change only takes effect once you confirm it from the new
            address. Currently <b>{customer.email}</b>.
          </p>
          <label className="bp-field">
            <span>New email</span>
            <input type="email" name="email" placeholder="you@example.com" />
          </label>
          <button className="ops-btn" type="submit">
            Send confirmation link
          </button>
        </form>
      </section>
    </div>
  );
}
