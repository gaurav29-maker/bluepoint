import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { experts as expertsTable } from "@/lib/db/schema";
import { openSlotsFor } from "@/lib/availability";
import { rethrowIfNavigation } from "@/lib/nav";
import { SLOT_MINUTES } from "@/lib/slots";
import { istDayLabel, istTime, rupees } from "@/lib/format";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import ExpertBooking from "@/components/ExpertBooking";
import type { ExpertCard } from "@/components/ExpertGrid";

export const dynamic = "force-dynamic";

const SPECIALTY_LABEL: Record<string, string> = {
  portfolio_audit: "Portfolio audits",
  fno_systematic: "F&O, systematically",
};

/** How far ahead the page looks when it says "next available". */
const PREVIEW_DAYS = 14;
/** Distinct days shown, not slots: see the note where the preview is built. */
const PREVIEW_DAY_COUNT = 6;

async function loadExpert(slug: string) {
  const [expert] = await db
    .select()
    .from(expertsTable)
    .where(and(eq(expertsTable.slug, slug), eq(expertsTable.status, "live")))
    .limit(1);
  return expert ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const expert = await loadExpert(slug);
    if (!expert) return { title: "Expert not found — Bluepoint" };
    return {
      title: `${expert.displayName} — Bluepoint`,
      description: expert.bio || expert.headline,
    };
  } catch {
    return { title: "Bluepoint" };
  }
}

export default async function ExpertProfile({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let expert;
  let slots;
  try {
    expert = await loadExpert(slug);
    if (!expert) notFound();

    const from = new Date();
    slots = await openSlotsFor(expert, from, new Date(from.getTime() + PREVIEW_DAYS * 86_400_000));
  } catch (err) {
    rethrowIfNavigation(err);
    return (
      <div className="site">
        <SiteNav />
        <div className="wrap bp-page">
          <div className="bp-panel">
            <h1>Not available right now</h1>
            <p className="note">We could not load this expert. Please try again shortly.</p>
            <Link className="b b-fill" href="/#experts">
              See all experts
            </Link>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const card: ExpertCard = {
    slug: expert.slug,
    displayName: expert.displayName,
    initials: expert.initials,
    headline: expert.headline,
    pricePaise: expert.pricePaise,
    sebiRegType: expert.sebiRegType,
    sebiRegNumber: expert.sebiRegNumber,
  };

  const registered = expert.sebiRegType !== "none" && expert.sebiRegNumber;

  /*
   * One entry per day rather than the first six slots. An expert working two
   * windows a day fills six slots inside a single afternoon, so the raw list
   * answered "what times on Thursday" when the question a reader actually has
   * is "how soon can I get in".
   */
  const byDay = new Map<string, Date[]>();
  for (const slot of slots) {
    const key = istDayLabel(slot.startsAt);
    const times = byDay.get(key);
    if (times) times.push(slot.startsAt);
    else byDay.set(key, [slot.startsAt]);
  }
  const preview = [...byDay.entries()]
    .slice(0, PREVIEW_DAY_COUNT)
    .map(([day, times]) => ({ day, first: times[0], count: times.length }));

  return (
    <div className="site">
      <SiteNav />

      <div className="wrap">
        <div className="doc">
          <Link className="back" href="/#experts">
            ← All experts
          </Link>

          <header className="doc-head">
            <div className="doc-av">{expert.initials}</div>
            <div>
              <h1 className="doc-name">{expert.displayName}</h1>
              <p className="xrole">{expert.headline}</p>
            </div>
          </header>

          {expert.bio ? <p className="doc-lede">{expert.bio}</p> : null}

          {/*
            The registration line is stated for every expert, registered or
            not. An unregistered expert whose row simply vanished would be the
            one case a reader most needs to see — and the terms already promise
            it is shown.
          */}
          <dl className="facts">
            {expert.specialties.length > 0 ? (
              <div>
                <dt>Focus</dt>
                <dd>{expert.specialties.map((x) => SPECIALTY_LABEL[x] ?? x).join(" · ")}</dd>
              </div>
            ) : null}
            <div>
              <dt>Experience</dt>
              <dd>{expert.yearsExperience} years</dd>
            </div>
            <div>
              <dt>Rate</dt>
              <dd className="rate">
                {rupees(expert.pricePaise)} <span>/ call</span>
              </dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>{SLOT_MINUTES} minutes, video</dd>
            </div>
            <div>
              <dt>SEBI</dt>
              <dd>
                {registered ? (
                  <>
                    {expert.sebiRegType.toUpperCase()} · {expert.sebiRegNumber}
                  </>
                ) : (
                  <span className="unreg">Not registered</span>
                )}
              </dd>
            </div>
          </dl>

          <p className="note">
            {registered
              ? "Registration is shown so you know who you are speaking to. It does not change what a session is."
              : "This expert holds no SEBI registration as an investment adviser or research analyst. It is stated here rather than left out."}{" "}
            Every Bluepoint session is a review and a discussion of what you already hold — never
            personalised investment advice, and never a recommendation to buy or sell.
          </p>

          <div className="cta-row">
            <ExpertBooking expert={card} label={`Book a call · ${rupees(expert.pricePaise)}`} />
            <span className="cta-note">Slots are live. Nothing is charged until you pay.</span>
          </div>

          {/*
            Real availability, computed by the same helper the booking dialog
            reads through — so this page cannot advertise a time the dialog
            then refuses.
          */}
          <section className="doc-sec">
            <h2 className="doc-h2">Next available</h2>
            {preview.length === 0 ? (
              <p className="note">
                Nothing open in the next {PREVIEW_DAYS} days. Other experts may have earlier times.
              </p>
            ) : (
              <>
                <ul className="slots">
                  {preview.map((d) => (
                    <li key={d.day}>
                      <b>{d.day}</b>
                      <span>
                        from {istTime(d.first)}
                        {d.count > 1 ? ` · ${d.count} times` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="note">
                  {slots.length} open time{slots.length === 1 ? "" : "s"} across the next{" "}
                  {PREVIEW_DAYS} days.
                </p>
              </>
            )}
          </section>

          <section className="doc-sec">
            <h2 className="doc-h2">What happens</h2>
            <ol className="ol">
              <li>
                <b>You send your holdings first.</b> A short form after payment — what you hold and
                in what proportion, in your own words. It is what lets the call start at the question
                rather than at the summary.
              </li>
              <li>
                <b>They read it before you meet.</b> Your expert opens the call already knowing the
                book.
              </li>
              <li>
                <b>{SLOT_MINUTES} minutes, one to one.</b> You ask. They read the position back to
                you and say what they see in it.
              </li>
              <li>
                <b>You decide.</b> Nothing is executed for you, and no one follows up to sell you
                anything.
              </li>
            </ol>
          </section>

          <section className="doc-sec">
            <h2 className="doc-h2">What this is not</h2>
            <ul className="ul">
              <li>Not a tip, a call, or a target.</li>
              <li>Not personalised investment advice.</li>
              <li>Not a place anyone asks for your demat or broker login — here or on the call.</li>
              <li>Not a subscription. One session is one session.</li>
            </ul>
            <p className="note">
              What you send is read by the expert you booked and no one else, and is deleted 90 days
              after the call.
            </p>
          </section>

          <div className="cta-row">
            <ExpertBooking expert={card} label={`Book a call · ${rupees(expert.pricePaise)}`} />
            <Link className="b b-line" href="/#experts">
              See other experts
            </Link>
          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
