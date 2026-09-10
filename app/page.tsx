import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { experts as expertsTable } from "@/lib/db/schema";
import { openSlotsFor } from "@/lib/availability";
import { istDayLabel, istTime, rupees } from "@/lib/format";
import { SLOT_MINUTES } from "@/lib/slots";
import {
  BUNDLE_CREDITS,
  BUNDLE_DAYS,
  BUNDLE_PRICE_PAISE,
  CONTACT_EMAIL,
  INTAKE_RETENTION_DAYS,
  MEMBERSHIP_TIERS,
  SINGLE_CALL_PAISE,
} from "@/lib/constants";
import ExpertGrid, { type ExpertCard } from "@/components/ExpertGrid";
import PassPurchase from "@/components/PassPurchase";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const dynamic = "force-dynamic";

const BROKERS = [
  "Zerodha",
  "HDFC Sec.",
  "ICICI Direct",
  "Groww",
  "Angel One",
  "Upstox",
  "Kotak Neo",
  "5paisa",
];

/*
 * What a portfolio review actually covers.
 *
 * Everything here is something an expert can look at and discuss. Notably
 * absent, and absent on purpose: thesis development, hedging and derivative
 * strategy. Those are advisory activities, and this platform is not a
 * registered adviser — see the terms.
 */
const REVIEW_COVERS = [
  "Concentration",
  "Diversification",
  "Sector exposure",
  "Position sizing",
  "Overlap between holdings",
  "How the portfolio is built",
  "Downside risk",
  "Where it is most vulnerable",
];

/** How far ahead the hero instrument reads, and how many days it shows. */
const PREVIEW_DAYS = 14;
const PREVIEW_CELLS = 4;

type Preview = { name: string; total: number; days: { day: string; first: Date; count: number }[] };

async function load(): Promise<{ experts: ExpertCard[]; dbReady: boolean; preview: Preview | null }> {
  try {
    const rows = await db
      .select({
        id: expertsTable.id,
        timezone: expertsTable.timezone,
        slug: expertsTable.slug,
        displayName: expertsTable.displayName,
        initials: expertsTable.initials,
        headline: expertsTable.headline,
        pricePaise: expertsTable.pricePaise,
        sebiRegType: expertsTable.sebiRegType,
        sebiRegNumber: expertsTable.sebiRegNumber,
      })
      .from(expertsTable)
      .where(eq(expertsTable.status, "live"))
      .orderBy(asc(expertsTable.pricePaise));

    const experts: ExpertCard[] = rows.map(({ id: _id, timezone: _tz, ...card }) => card);

    /*
     * The hero carries a real availability read where a reference design would
     * put a photograph. It goes through the same helper the booking dialog
     * reads, so this panel cannot advertise a week the dialog then refuses.
     */
    let preview: Preview | null = null;
    const first = rows[0];
    if (first) {
      const from = new Date();
      const slots = await openSlotsFor(
        { id: first.id, timezone: first.timezone },
        from,
        new Date(from.getTime() + PREVIEW_DAYS * 86_400_000),
      );

      const byDay = new Map<string, Date[]>();
      for (const s of slots) {
        const key = istDayLabel(s.startsAt);
        const seen = byDay.get(key);
        if (seen) seen.push(s.startsAt);
        else byDay.set(key, [s.startsAt]);
      }

      preview = {
        name: first.displayName,
        total: slots.length,
        days: [...byDay.entries()]
          .slice(0, PREVIEW_CELLS)
          .map(([day, times]) => ({ day, first: times[0], count: times.length })),
      };
    }

    return { experts, dbReady: true, preview };
  } catch {
    // No database yet. Render the page rather than a stack trace.
    return { experts: [], dbReady: false, preview: null };
  }
}

export default async function Home() {
  const { experts, dbReady, preview } = await load();

  return (
    <div className="site">
      <SiteNav onLanding />

      <header className="hero-band">
        <div className="wrap">
          <p className="reject">
            <span>Not a tip service</span>
            <span>Not a Telegram group</span>
            <span>Not a distributor</span>
          </p>
          <h1>
            Real experts. Real work. <span className="said">Real conversations.</span>
          </h1>
          <p className="hero-sub">
            Book an experienced market professional directly. They read your portfolio before you
            meet, and tell you what they actually see in it. No pitch at the end of the call.
          </p>
          <div className="b-pair">
            <a className="b b-fill" href="#experts">
              Find an expert
            </a>
            <a className="b b-line" href="#audit">
              Audit my portfolio
            </a>
          </div>

          {preview && preview.days.length > 0 ? (
            <div className="inst">
              <div className="inst-top">
                <span className="eyebrow">Next available · {preview.name}</span>
                <span className="live">
                  <i className="dot" /> Live
                </span>
              </div>
              <div className="inst-grid">
                {preview.days.map((d) => (
                  <div className="inst-cell" key={d.day}>
                    <b>{d.day}</b>
                    <span>
                      from {istTime(d.first)}
                      {d.count > 1 ? ` · ${d.count} times` : ""}
                    </span>
                  </div>
                ))}
              </div>
              <p className="inst-foot">
                {preview.total} open time{preview.total === 1 ? "" : "s"} across the next{" "}
                {PREVIEW_DAYS} days · all times IST
              </p>
            </div>
          ) : null}
        </div>
      </header>

      <div className="strip">
        <div className="strip-in">
          <span className="eyebrow">Built for investors using</span>
          <ul>
            {BROKERS.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      </div>

      {/*
        The ladder comes before the expert grid on purpose. A visitor has to
        understand what they can buy before a list of people means anything.
      */}
      <section className="band alt" id="ways">
        <div className="wrap">
          <div className="band-head">
            <span className="eyebrow">Three ways to work with us</span>
            <h2>Start with a conversation. Go as deep as you want.</h2>
          </div>

          <div className="ladder">
            <div className="rung">
              <p className="rung-step">One-time</p>
              <h3>Individual call</h3>
              <p className="rung-line">One question. One expert. One meaningful conversation.</p>
              <p className="rung-price">{rupees(SINGLE_CALL_PAISE)}</p>
              <p className="rung-per">a session, {SLOT_MINUTES} minutes</p>
              <ul>
                <li>A specific investment question</li>
                <li>A company or sector discussion</li>
                <li>A portfolio review</li>
                <li>A second opinion</li>
              </ul>
              <div className="rung-foot">
                <a className="b b-line" href="#experts">
                  Find an expert
                </a>
                <p className="rung-also">
                  Or {BUNDLE_CREDITS} calls with the same expert for {rupees(BUNDLE_PRICE_PAISE)},
                  valid {BUNDLE_DAYS} days.
                </p>
              </div>
            </div>

            <div className="rung">
              <p className="rung-step">Ongoing</p>
              <h3>{MEMBERSHIP_TIERS.quarterly.label}</h3>
              <p className="rung-line">Ongoing access and periodic portfolio review.</p>
              <p className="rung-price">{rupees(MEMBERSHIP_TIERS.quarterly.pricePaise)}</p>
              <p className="rung-per">{MEMBERSHIP_TIERS.quarterly.days} days, unlimited calls</p>
              <ul>
                <li>Any expert, as often as you like</li>
                <li>Come back as the position changes</li>
                <li>Follow-up conversations</li>
                <li>Your own console, with your history</li>
              </ul>
              <div className="rung-foot">
                <PassPurchase
                  tier="quarterly"
                  label={MEMBERSHIP_TIERS.quarterly.label}
                  priceLabel={rupees(MEMBERSHIP_TIERS.quarterly.pricePaise)}
                  cta="Get quarterly"
                  className="b b-line"
                />
              </div>
            </div>

            <div className="rung deepest">
              <p className="rung-step">Long term</p>
              <h3>{MEMBERSHIP_TIERS.annual.label}</h3>
              <p className="rung-line">
                A long-term relationship with people who know your portfolio.
              </p>
              <p className="rung-price">{rupees(MEMBERSHIP_TIERS.annual.pricePaise)}</p>
              <p className="rung-per">{MEMBERSHIP_TIERS.annual.days} days, unlimited calls</p>
              <ul>
                <li>Everything in the quarterly</li>
                <li>Regular portfolio reviews</li>
                <li>Sector and thematic discussions</li>
                <li>A record of how your book has moved</li>
              </ul>
              <div className="rung-foot">
                <PassPurchase
                  tier="annual"
                  label={MEMBERSHIP_TIERS.annual.label}
                  priceLabel={rupees(MEMBERSHIP_TIERS.annual.pricePaise)}
                  cta="Get annual"
                  className="b b-fill"
                />
              </div>
            </div>
          </div>

          <p className="progression">
            Start with <b>one conversation</b>. If it is useful, keep the same people across a{" "}
            <b>quarter</b>. If it keeps being useful, make it the <b>year</b>. Nothing renews on its
            own — you decide each time.
          </p>
        </div>
      </section>

      <section className="band" id="audit">
        <div className="wrap">
          <div className="band-head">
            <span className="eyebrow">Audit my portfolio</span>
            <h2>A real expert reads your actual portfolio.</h2>
            <p>
              Not an automated score. A person who has run money looks at what you hold and tells
              you what they see in it.
            </p>
          </div>

          {/*
            The order here is the order the software actually works in. The
            expert is chosen and the time is booked before the portfolio is
            shared, because the intake form is reached after payment — showing
            "share portfolio" first would describe a flow that does not exist.
          */}
          <div className="audit-steps">
            <div className="audit-step">
              <p className="n">01</p>
              <h3>Choose your expert</h3>
              <p>On focus, experience and rate. Every profile states all three.</p>
            </div>
            <div className="audit-step">
              <p className="n">02</p>
              <h3>Book a time</h3>
              <p>Live availability. Pick a slot that suits you.</p>
            </div>
            <div className="audit-step">
              <p className="n">03</p>
              <h3>Share your portfolio</h3>
              <p>A short form. What you hold and in what proportion, in your own words.</p>
            </div>
            <div className="audit-step">
              <p className="n">04</p>
              <h3>They read it first</h3>
              <p>Before you meet, so the call starts at your question.</p>
            </div>
            <div className="audit-step">
              <p className="n">05</p>
              <h3>You discuss it</h3>
              <p>{SLOT_MINUTES} minutes, one to one. Then you decide what to do.</p>
            </div>
          </div>

          <p className="eyebrow" style={{ marginBottom: 16 }}>
            What a review looks at
          </p>
          <ul className="covers">
            {REVIEW_COVERS.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="band alt" id="experts">
        <div className="wrap">
          <div className="band-head">
            <span className="eyebrow">The expert network</span>
            <h2>
              The right expert changes the <span className="said">conversation</span>.
            </h2>
            <p>Every expert shows their SEBI registration, or says plainly that they have none.</p>
          </div>
          <ExpertGrid experts={experts} dbReady={dbReady} />
        </div>
      </section>

      <section className="band" id="how">
        <div className="wrap">
          <div className="band-head">
            <span className="eyebrow">How it works</span>
            <h2>
              Your review, <span className="said">effortlessly</span>.
            </h2>
            <p>Six steps in order — no back-and-forth scheduling emails.</p>
          </div>
          <div className="flow">
            <div className="flow-step">
              <p className="n">01</p>
              <h3>Tell us what you need</h3>
              <p>A portfolio review, a company question, a sector view, a second opinion.</p>
            </div>
            <div className="flow-step">
              <p className="n">02</p>
              <h3>Find the right expert</h3>
              <p>Compare focus, experience, registration and rate.</p>
            </div>
            <div className="flow-step">
              <p className="n">03</p>
              <h3>Book a time</h3>
              <p>Availability is live. A held slot releases itself if payment does not complete.</p>
            </div>
            <div className="flow-step">
              <p className="n">04</p>
              <h3>Share your portfolio</h3>
              <p>Or just your question, if that is what you came with.</p>
            </div>
            <div className="flow-step">
              <p className="n">05</p>
              <h3>Have a real conversation</h3>
              <p>{SLOT_MINUTES} minutes, one to one, with someone who has read it.</p>
            </div>
            <div className="flow-step">
              <p className="n">06</p>
              <h3>Continue if you want to</h3>
              <p>Come back for one more, or keep the same people for a quarter.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="band alt">
        <div className="wrap">
          <div className="band-head">
            <span className="eyebrow">Terms of the thing</span>
            <h2>What this is not.</h2>
          </div>
          <div className="nots">
            <div className="not">
              <p>
                <b>Not a tip, a call, or a target.</b> Nobody tells you what to buy.
              </p>
            </div>
            <div className="not">
              <p>
                <b>Not personalised investment advice.</b> A session is a review and a discussion.
              </p>
            </div>
            <div className="not">
              <p>
                <b>Not an automated score.</b> A person reads your portfolio, not a model.
              </p>
            </div>
            <div className="not">
              <p>
                <b>Not a place anyone asks for your demat login.</b> There is no field for one.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="band" id="faq">
        <div className="wrap">
          <div className="band-head">
            <span className="eyebrow">Frequently asked</span>
            <h2>Still curious?</h2>
          </div>
          <div className="faq">
            <details>
              <summary>Do I need to share my demat login?</summary>
              <p>
                No. You share a summary of your holdings before the call — never login credentials.
                There is no field anywhere on Bluepoint that accepts one.
              </p>
            </details>
            <details>
              <summary>Is this AI reading my portfolio?</summary>
              <p>
                No. A named person with market experience reads what you send and talks to you about
                it. Nothing on this platform generates an automated verdict on your holdings.
              </p>
            </details>
            <details>
              <summary>Do experts give stock tips?</summary>
              <p>
                No. Experts review your existing portfolio and approach. They do not recommend
                specific trades, and nothing said on a call is personalised investment advice.
              </p>
            </details>
            <details>
              <summary>Do I get anything in writing?</summary>
              <p>
                Your expert writes up what the session covered, and it sits in your console beside
                what you sent them. It is a record of what was discussed — not a recommendation, and
                not something to act on by itself.
              </p>
            </details>
            <details>
              <summary>What is the difference between the packages?</summary>
              <p>
                An individual call is one conversation. The quarterly and annual passes are
                unlimited calls with any expert across {MEMBERSHIP_TIERS.quarterly.days} or{" "}
                {MEMBERSHIP_TIERS.annual.days} days, so you can come back as your position changes
                rather than saving everything for one session.
              </p>
            </details>
            <details>
              <summary>What happens to my portfolio details afterwards?</summary>
              <p>
                They go only to the expert you booked, and are deleted {INTAKE_RETENTION_DAYS} days
                after the call — along with whatever your expert wrote up afterwards.
              </p>
            </details>
            <details>
              <summary>What if I am not satisfied with the call?</summary>
              <p>
                Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> within 24 hours and we
                will arrange a follow-up or a refund, case by case.
              </p>
            </details>
          </div>
        </div>
      </section>

      <section className="band alt closer">
        <div className="wrap">
          <h2>One call. One honest read.</h2>
          <p className="triple">You book. They look. You decide.</p>
          <div className="b-pair">
            <a className="b b-fill" href="#experts">
              Find an expert
            </a>
            <a className="b b-line" href="#audit">
              Audit my portfolio
            </a>
          </div>
        </div>
      </section>

      <SiteFooter onLanding />
    </div>
  );
}
