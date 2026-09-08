import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { availabilityRules, bookings, experts } from "@/lib/db/schema";
import { rupees } from "@/lib/format";
import NoDatabase from "@/components/ops/NoDatabase";
import { setExpertPrice, setExpertStatus } from "../actions";

export const dynamic = "force-dynamic";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

async function load() {
  try {
    const rows = await db.select().from(experts).orderBy(asc(experts.displayName));
    const rules = await db.select().from(availabilityRules);
    const counts = await db
      .select({ expertId: bookings.expertId, n: sql<number>`count(*)::int` })
      .from(bookings)
      .where(eq(bookings.status, "completed"))
      .groupBy(bookings.expertId);

    const byExpert = new Map<string, number>();
    for (const c of counts) byExpert.set(c.expertId, c.n);

    return rows.map((e) => ({
      ...e,
      completed: byExpert.get(e.id) ?? 0,
      rules: rules
        .filter((r) => r.expertId === e.id)
        .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute),
    }));
  } catch {
    return null;
  }
}

export default async function OpsExperts() {
  const rows = await load();
  if (rows === null) return <NoDatabase />;

  return (
    <>
      <h1 className="ops-h1">Experts</h1>
      <p className="ops-muted ops-lede">
        Pausing an expert hides them from the site immediately and stops new bookings. Calls already
        booked are untouched.
      </p>

      {rows.length === 0 ? (
        <p className="ops-muted">No experts yet. Run the seed, or add rows to the database.</p>
      ) : (
        <div className="ops-expert-list">
          {rows.map((e) => (
            <div key={e.id} className="ops-panel ops-expert">
              <div className="ops-expert-head">
                <div>
                  <h2 className="ops-h2">
                    {e.displayName} <span className={`pill s-${e.status}`}>{e.status}</span>
                  </h2>
                  <p className="ops-muted">
                    {e.headline} · /{e.slug} · {e.completed} completed
                  </p>
                  <p className="ops-muted">
                    {e.sebiRegType === "none" || !e.sebiRegNumber ? (
                      <span className="pill warn">no SEBI number on file</span>
                    ) : (
                      <>
                        SEBI {e.sebiRegType.toUpperCase()} · {e.sebiRegNumber}
                      </>
                    )}
                  </p>
                </div>

                <div className="ops-expert-controls">
                  <form action={setExpertPrice} className="ops-inline">
                    <input type="hidden" name="expertId" value={e.id} />
                    <label className="ops-mini">
                      ₹
                      <input
                        name="rupees"
                        type="number"
                        min={0}
                        step={50}
                        defaultValue={e.pricePaise / 100}
                        className="ops-input narrow"
                      />
                    </label>
                    <button className="ops-btn" type="submit">
                      Save price
                    </button>
                  </form>

                  <form action={setExpertStatus} className="ops-inline">
                    <input type="hidden" name="expertId" value={e.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={e.status === "live" ? "paused" : "live"}
                    />
                    <button className="ops-btn" type="submit">
                      {e.status === "live" ? "Pause" : "Set live"}
                    </button>
                  </form>
                </div>
              </div>

              <div className="ops-avail">
                <span className="ops-avail-label">Weekly availability</span>
                {e.rules.length === 0 ? (
                  <span className="pill warn">none — nothing is bookable</span>
                ) : (
                  <ul className="ops-avail-list">
                    {e.rules.map((r) => (
                      <li key={r.id}>
                        <b>{DAYS[r.weekday]}</b> {hhmm(r.startMinute)}–{hhmm(r.endMinute)}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="ops-muted ops-foot">
                  Editing availability is not in the console yet — change{" "}
                  <code>availability_rules</code> directly, or re-run the seed.
                </p>
              </div>

              <p className="ops-muted">
                Rate shown on the site: <b>{rupees(e.pricePaise)}</b> · meeting link{" "}
                {e.meetingUrl ? <code>{e.meetingUrl}</code> : <span className="pill warn">missing</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
