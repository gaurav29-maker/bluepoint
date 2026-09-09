import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { mintLink } from "@/lib/member-auth";
import { memberSignInLink, sendRaw } from "@/lib/email";

export const metadata: Metadata = { title: "Sign in — Bluepoint", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MemberLogin({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  async function requestLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();

    if (email) {
      try {
        const [customer] = await db
          .select()
          .from(customers)
          .where(sql`lower(${customers.email}) = ${email.toLowerCase()}`)
          .limit(1);

        if (customer) {
          const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
          const url = `${base}/api/member/session?t=${await mintLink(customer.id)}`;
          await sendRaw({
            to: customer.email,
            ...memberSignInLink({ customerName: customer.name, url }),
          });
        }
      } catch (err) {
        console.error("[member] sign-in link failed", err);
      }
    }

    // Always the same answer, whether or not the address is known — otherwise
    // this page tells a stranger who your customers are.
    redirect("/member/login?sent=1");
  }

  return (
    <div className="ops-login">
      <form action={requestLink} className="ops-login-card">
        <p className="logo os-mark">
          blue<span>point</span> <em>os</em>
        </p>
        <h1>Bluepoint OS</h1>
        <p className="ops-login-sub">
          Enter the email your pass was bought with. We will send a link — no password.
        </p>

        {sent ? (
          <p className="bp-chosen" style={{ display: "block" }}>
            If that address has a Bluepoint pass, a sign-in link is on its way. It expires in 30
            minutes.
          </p>
        ) : null}

        <label className="bp-field">
          <span>Email</span>
          <input type="email" name="email" autoFocus autoComplete="email" required />
        </label>

        <button className="btn-primary bp-full" type="submit">
          Send me a link
        </button>
      </form>
    </div>
  );
}
