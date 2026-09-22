import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { experts } from "@/lib/db/schema";
import { EXPERT_COOKIE, verifyExpertSession } from "@/lib/expert-auth";
import { rethrowIfNavigation } from "@/lib/nav";
import { rupees } from "@/lib/format";
import ExpertBar from "@/components/expert/ExpertBar";
import { disconnectGoogle, setOwnPaused, updateExpertProfile } from "../actions";
import { googleConfigured, isConnected } from "@/lib/google";

export const metadata: Metadata = { title: "Your profile — Landline", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ExpertProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const { google: googleResult } = await searchParams;
  const expertId = await verifyExpertSession((await cookies()).get(EXPERT_COOKIE)?.value);
  if (!expertId) redirect("/expert/login");

  let me;
  try {
    [me] = await db.select().from(experts).where(eq(experts.id, expertId)).limit(1);
    if (!me) redirect("/expert/login");
  } catch (err) {
    rethrowIfNavigation(err);
    return (
      <div className="wrap bp-page member">
        <div className="bp-panel">
          <h1>Not available right now</h1>
          <p className="bp-muted">We could not reach your profile. Please try again shortly.</p>
        </div>
      </div>
    );
  }

  const registered = me.sebiRegType !== "none" && me.sebiRegNumber;
  const configured = googleConfigured();
  const connected = configured ? await isConnected(me.id) : null;

  return (
    <div className="wrap bp-page member">
      <ExpertBar current="profile" />

      <h1 className="ops-h1">Your profile</h1>
      <p className="bp-muted ops-lede">
        This is what someone reads before deciding to book you. Changes show on the site
        immediately.
      </p>

      <section className="member-section">
        <h2 className="member-h2">How you are listed</h2>
        <form action={updateExpertProfile} className="apply-form xp-profile-form">
          <label className="apply-field">
            <span>Your headline</span>
            <input
              name="headline"
              defaultValue={me.headline}
              maxLength={90}
              required
              placeholder="Portfolio audits · 9 yrs"
            />
          </label>

          <label className="apply-field">
            <span>What you do in a session</span>
            <textarea name="bio" rows={5} defaultValue={me.bio} required />
          </label>

          {/*
            A rate change never touches a booking that already exists: the
            amount is captured when the slot is held, not when the call
            happens. Said plainly here so nobody avoids changing it out of a
            fear of re-billing somebody.
          */}
          <label className="apply-field xp-price-field">
            <span>Your rate per session, in rupees</span>
            <input
              name="priceRupees"
              type="number"
              min={500}
              max={50000}
              step={1}
              defaultValue={Math.round(me.pricePaise / 100)}
              required
            />
          </label>
          <p className="apply-hint">
            Currently {rupees(me.pricePaise)}. Anyone already booked keeps the price they paid — a
            change only applies to bookings made after it.
          </p>

          <button className="btn-primary apply-submit" type="submit">
            Save
          </button>
        </form>
      </section>

      {/*
        Read-only on purpose. The value of this line on a public profile is
        that somebody checked it against the SEBI register before this expert
        went live. If it could be edited afterwards, that check would be
        verifying nothing.
      */}
      <section className="member-section">
        <h2 className="member-h2">Checked before you went live</h2>
        <dl className="xprof-facts xp-facts">
          <div>
            <dt>SEBI</dt>
            <dd>
              {registered ? (
                <>
                  {me.sebiRegType.toUpperCase()} · {me.sebiRegNumber}
                </>
              ) : (
                <span className="expert-none">Not registered</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Name</dt>
            <dd>{me.displayName}</dd>
          </div>
          <div>
            <dt>Profile</dt>
            <dd>
              {/* What a customer sees. An expert should be able to go and look. */}
              <a className="ops-link" href={`/experts/${me.slug}`} target="_blank" rel="noreferrer">
                /experts/{me.slug}
              </a>
            </dd>
          </div>
        </dl>
        {me.background ? (
          <p className="xp-bg">
            <span className="xp-bg-label">Background, as published</span>
            {me.background}
          </p>
        ) : null}

        <p className="apply-hint">
          These are the facts a person checked before you were published, so they are not editable
          here — a fact you could rewrite afterwards was never really verified. Email us if any of
          them is wrong and we will correct it.
        </p>
      </section>

      {/*
        Connecting a calendar is optional and says so. An expert who never
        does keeps the manual paste on their schedule, which is why that
        was built first — this removes a step, it is not load-bearing.
      */}
      <section className="member-section">
        <h2 className="member-h2">Google Calendar</h2>

        {googleResult === "connected" ? (
          <p className="xp-gcal-msg ok">Connected. New bookings will get a Meet link automatically.</p>
        ) : null}
        {googleResult === "cancelled" ? (
          <p className="xp-gcal-msg">No problem — nothing changed. You can still paste links yourself.</p>
        ) : null}
        {googleResult === "failed" ? (
          <p className="xp-gcal-msg bad">That did not complete. Try again, or just paste links yourself.</p>
        ) : null}
        {googleResult === "unconfigured" ? (
          <p className="xp-gcal-msg bad">Not available yet — Landline has not finished setting this up.</p>
        ) : null}

        {!configured ? (
          <p className="bp-muted">
            Not available yet. Until it is, add each session&rsquo;s join link yourself from your
            schedule — there is a one-click Calendar shortcut next to the field.
          </p>
        ) : connected ? (
          <div className="xp-pause">
            <p className="bp-muted">
              Connected as <b>{connected.email}</b>. Every new booking gets its own Meet link and
              lands in your calendar, so there is nothing to paste.
            </p>
            <form action={disconnectGoogle}>
              <button className="ops-btn" type="submit">
                Disconnect
              </button>
            </form>
            <p className="apply-hint">
              Sessions that already have a link keep it — those events exist on your calendar and
              the customer may already have the link.
            </p>
          </div>
        ) : (
          <div className="xp-pause">
            <p className="bp-muted">
              Connect your calendar and Landline creates the Meet link for each session, on your
              own calendar, the moment it is booked. You stop pasting links.
            </p>
            <a className="ops-btn" href="/api/expert/google/connect">
              Connect Google Calendar
            </a>
            <p className="apply-hint">
              Landline can create and update events, and read the address of the account you
              connect. It cannot read your existing events, your contacts, or anything else.
              Disconnect whenever you like.
            </p>
          </div>
        )}
      </section>

      <section className="member-section">
        <h2 className="member-h2">Taking bookings</h2>
        {me.status === "draft" ? (
          <p className="bp-muted">
            Your profile is not published yet. Set your weekly hours on{" "}
            <Link className="ops-link" href="/expert/availability">
              Availability
            </Link>{" "}
            and we will put you live.
          </p>
        ) : (
          <div className="xp-pause">
            <p className="bp-muted">
              {me.status === "live"
                ? "You are listed and bookable. Pausing hides you from the site straight away — anything already booked still stands."
                : "You are paused and not listed. Nobody can book a new session until you come back."}
            </p>
            <form action={setOwnPaused}>
              <input type="hidden" name="paused" value={me.status === "live" ? "true" : "false"} />
              <button className="ops-btn" type="submit">
                {me.status === "live" ? "Pause my listing" : "Start taking bookings"}
              </button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
