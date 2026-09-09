import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { experts } from "@/lib/db/schema";
import { mintExpertLink } from "@/lib/expert-auth";
import { expertSignInLink, sendRaw } from "@/lib/email";
import { SIGN_IN_THROTTLE_SECONDS } from "@/lib/constants";

export const metadata: Metadata = { title: "Experts — Bluepoint", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ExpertLogin({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; expired?: string }>;
}) {
  const { sent, expired } = await searchParams;

  async function requestLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();

    if (email) {
      try {
        const [expert] = await db
          .select()
          .from(experts)
          .where(sql`lower(${experts.contactEmail}) = ${email.toLowerCase()}`)
          .limit(1);

        const recent =
          expert?.lastLinkSentAt &&
          Date.now() - expert.lastLinkSentAt.getTime() < SIGN_IN_THROTTLE_SECONDS * 1000;

        if (expert && !recent) {
          const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
          const url = `${base}/api/expert/session?t=${await mintExpertLink(expert.id)}`;
          await sendRaw({
            to: expert.contactEmail,
            ...expertSignInLink({ expertName: expert.displayName, url }),
          });
          await db
            .update(experts)
            .set({ lastLinkSentAt: new Date() })
            .where(eq(experts.id, expert.id));
        }
      } catch (err) {
        console.error("[expert] sign-in link failed", err);
      }
    }

    // Same answer either way, so this cannot be used to discover who is listed.
    redirect("/expert/login?sent=1");
  }

  return (
    <div className="ops-login">
      <form action={requestLink} className="ops-login-card">
        <p className="logo os-mark">
          blue<span>point</span> <em>experts</em>
        </p>
        <h1>Your schedule</h1>
        <p className="ops-login-sub">
          Enter the email Bluepoint contacts you on. We will send a link — no password.
        </p>

        {sent ? (
          <p className="member-done">
            If that address belongs to an expert here, a sign-in link is on its way. It expires in
            30 minutes.
          </p>
        ) : null}
        {expired ? <p className="bp-error">That link has expired. Here is a fresh one.</p> : null}

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
