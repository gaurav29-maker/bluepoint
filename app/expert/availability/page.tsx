import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { availabilityRules, experts } from "@/lib/db/schema";
import { EXPERT_COOKIE, verifyExpertSession } from "@/lib/expert-auth";
import { rethrowIfNavigation } from "@/lib/nav";
import { addAvailability, removeAvailability } from "../actions";

export const metadata: Metadata = { title: "Availability — Bluepoint", robots: { index: false } };
export const dynamic = "force-dynamic";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

export default async function Availability() {
  const expertId = await verifyExpertSession((await cookies()).get(EXPERT_COOKIE)?.value);
  if (!expertId) redirect("/expert/login");

  let expert;
  let rules;
  try {
    [expert] = await db.select().from(experts).where(eq(experts.id, expertId)).limit(1);
    if (!expert) redirect("/expert/login");
    rules = await db
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.expertId, expertId))
      .orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startMinute));
  } catch (err) {
    rethrowIfNavigation(err);
    return (
      <div className="wrap bp-page member">
        <div className="bp-panel">
          <h1>Not available right now</h1>
          <p className="bp-muted">Please try again shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap bp-page member">
      <div className="os-bar">
        <Link href="/expert" className="logo os-mark">
          blue<span>point</span> <em>experts</em>
        </Link>
        <span className="os-nav">
          <Link href="/expert">Schedule</Link>
        </span>
      </div>

      <h1 className="ops-h1">Availability</h1>
      <p className="bp-muted ops-lede">
        The hours you are bookable, every week, in IST. Customers only ever see times inside these
        windows, minus anything already taken. Changes apply immediately.
      </p>

      <section className="member-section">
        <h2 className="member-h2">Your weekly windows</h2>
        {rules.length === 0 ? (
          <p className="bp-muted">
            None set, so nothing is bookable. Add a window below.
          </p>
        ) : (
          <ul className="member-list">
            {rules.map((r) => (
              <li key={r.id}>
                <div>
                  <b>{DAYS[r.weekday]}</b>
                  <span className="ops-sub">
                    {hhmm(r.startMinute)} — {hhmm(r.endMinute)}
                  </span>
                </div>
                <span className="member-list-right">
                  <form action={removeAvailability}>
                    <input type="hidden" name="ruleId" value={r.id} />
                    <button className="ops-btn" type="submit">
                      Remove
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="member-section">
        <form action={addAvailability} className="bp-panel xp-add">
          <h2 className="member-h2">Add a window</h2>
          <div className="xp-add-row">
            <label className="bp-field">
              <span>Day</span>
              <select name="weekday" defaultValue="1">
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="bp-field">
              <span>From</span>
              <input type="time" name="from" defaultValue="10:00" required />
            </label>
            <label className="bp-field">
              <span>To</span>
              <input type="time" name="to" defaultValue="13:00" required />
            </label>
          </div>
          <button className="btn-primary" type="submit">
            Add window
          </button>
          <p className="bp-fineprint">
            A window shorter than one session produces no bookable times, so 45 minutes is the
            minimum.
          </p>
        </form>
      </section>
    </div>
  );
}
