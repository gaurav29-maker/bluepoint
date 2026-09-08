import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { OPS_COOKIE, mintSession, passwordMatches } from "@/lib/ops-auth";

export const metadata: Metadata = { title: "Ops — Bluepoint", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OpsLogin({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  async function signIn(formData: FormData) {
    "use server";
    const password = String(formData.get("password") ?? "");
    const target = String(formData.get("next") ?? "/ops");

    if (!(await passwordMatches(password))) {
      redirect(`/ops/login?error=1${target ? `&next=${encodeURIComponent(target)}` : ""}`);
    }

    const { value, expiresAt } = await mintSession();
    (await cookies()).set(OPS_COOKIE, value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: expiresAt,
    });
    // Only ever bounce to a path on this site.
    redirect(target.startsWith("/ops") ? target : "/ops");
  }

  return (
    <div className="ops-login">
      <form action={signIn} className="ops-login-card">
        <p className="logo">
          blue<span>point</span>
        </p>
        <h1>Ops console</h1>
        <p className="ops-login-sub">Bookings, payments and intake forms. Staff only.</p>

        <input type="hidden" name="next" value={next ?? "/ops"} />
        <label className="bp-field">
          <span>Password</span>
          <input type="password" name="password" autoFocus autoComplete="current-password" />
        </label>

        {error ? <p className="bp-error">That password is not right.</p> : null}

        <button className="btn-primary bp-full" type="submit">
          Sign in
        </button>
      </form>
    </div>
  );
}
