import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { experts as expertsTable } from "@/lib/db/schema";
import { openSlotsFor } from "@/lib/availability";
import { istDayLabel, istTime, rupees } from "@/lib/format";
import { SLOT_MINUTES } from "@/lib/slots";
import {
  BUNDLE_CREDITS,
  BUNDLE_DAYS,
  BUNDLE_PER_CALL_PAISE,
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
     * The hero carries a real availability read where the reference design
     * puts a photograph of the product. It goes through the same helper the
     * booking dialog reads, so this panel cannot advertise a week the dialog
     * then refuses.
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
            Get a <span className="said">fix</span> on your position, before the market does.
          </h1>
          <p className="hero-sub">
            Book a call with a market expert. A straight read on what you hold, or a system for
            sizing your F&amp;O trades instead of guessing. No pitch at the end of the call.
          </p>
          <div className="b-pair">
            <a className="b b-fill" href="#experts">
              Browse experts
            </a>
            <a className="b b-line" href="#how">
              How it works
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
          <span className="eyebrow">Built for traders using</span>
          <ul>
            {BROKERS.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      </div>

      <section className="band" id="experts">
        <div className="wrap">
          <div className="band-head">
            <span className="eyebrow">Our experts</span>
            <h2>
              Pick an expert who <span className="said">fits</span> your portfolio
            </h2>
            <p>Every expert shows their SEBI registration, or says plainly that they have none.</p>
          </div>
          <ExpertGrid experts={experts} dbReady={dbReady} />
        </div>
      </section>

      <section className="band alt" id="how">
        <div className="wrap">
          <div className="band-head">
            <span className="eyebrow">Process</span>
            <h2>
              Your review, <span className="said">effortlessly</span>.
            </h2>
            <p>Four steps in order — no back-and-forth scheduling emails.</p>
          </div>
          {/* Numbered because it genuinely is a sequence; the order carries information. */}
          <div className="steps">
            <div className="step">
              <p className="step-n">01</p>
              <h3>Choose your expert</h3>
              <p>Pick on focus, rate and registration. Every profile states all three.</p>
            </div>
            <div className="step">
              <p className="step-n">02</p>
              <h3>Pick a slot</h3>
              <p>Availability is live. A held slot releases itself if payment does not complete.</p>
            </div>
            <div className="step">
              <p className="step-n">03</p>
              <h3>Send your holdings</h3>
              <p>A short form after payment. It is what lets the call start at the question.</p>
            </div>
            <div className="step">
              <p className="step-n">04</p>
              <h3>Take the call</h3>
              <p>
                {SLOT_MINUTES} minutes, one to one. They read the position back to you and say what
                they see in it.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap split">
          <div className="split-copy">
            <span className="eyebrow">Before the call</span>
            <h2>They arrive already knowing the book.</h2>
            <p>
              You write down what you hold and in what proportion, in your own words. Your expert
              reads it before you meet, so the {SLOT_MINUTES} minutes start at your question instead
              of at a summary.
            </p>
            <p className="fine">
              What you send goes to the expert you booked and no one else, and is deleted{" "}
              {INTAKE_RETENTION_DAYS} days after the call.
            </p>
          </div>

          {/*
            Illustrative figures, labelled as such on the panel itself. An
            invented allocation under a real-looking name would be a
            fabricated customer presented as a real one, on a page selling
            financial services.
          */}
          <div className="alloc">
            <div className="alloc-top">
              <span className="eyebrow">What your expert sees</span>
              <span className="eyebrow">Example</span>
            </div>
            {[
              { label: "IT largecaps", pct: 45 },
              { label: "PSU bank", pct: 20 },
              { label: "Smallcap MFs", pct: 20 },
              { label: "Cash", pct: 15 },
            ].map((h) => (
              <div className="alloc-row" key={h.label}>
                <span className="alloc-label">{h.label}</span>
                <span className="alloc-pct">{h.pct}%</span>
                <span className="alloc-bar">
                  <i style={{ width: `${h.pct}%` }} />
                </span>
              </div>
            ))}
            <p className="alloc-note">
              Plus whatever you want to say in your own words. The sentence a percentage cannot
              carry is usually the one your expert needs.
            </p>
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
                <b>Not a place anyone asks for your demat login.</b> There is no field for one.
              </p>
            </div>
            <div className="not">
              <p>
                <b>Not a subscription.</b> One session is one session.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="band" id="pricing">
        <div className="wrap">
          <div className="band-head">
            <span className="eyebrow">Pricing</span>
            <h2>Pay per call, or stop counting.</h2>
            <p>Every price is what you pay. Nothing renews on its own.</p>
          </div>

          <div className="prices">
            <div className="price">
              <div className="price-name">
                <span className="eyebrow">Single call</span>
              </div>
              <p className="amount">{rupees(SINGLE_CALL_PAISE)}</p>
              <p className="per">One session with an expert</p>
              <ul>
                <li>{SLOT_MINUTES}-minute video call</li>
                <li>Intake read before the call</li>
                <li>Any expert on the platform</li>
              </ul>
              <div className="price-foot">
                <a className="b b-line" href="#experts">
                  Book one
                </a>
              </div>
            </div>

            <div className="price">
              <div className="price-name">
                <span className="eyebrow">{BUNDLE_CREDITS}-call bundle</span>
              </div>
              <p className="amount">{rupees(BUNDLE_PRICE_PAISE)}</p>
              <p className="per">
                {rupees(BUNDLE_PER_CALL_PAISE)} a call · valid {BUNDLE_DAYS} days
              </p>
              <ul>
                <li>{BUNDLE_CREDITS} sessions</li>
                <li>Same expert across all of them</li>
                <li>Book the other two later</li>
              </ul>
              <div className="price-foot">
                <a className="b b-line" href="#experts">
                  Buy a bundle
                </a>
              </div>
            </div>

            <div className="price pick">
              <div className="price-name">
                <span className="eyebrow">{MEMBERSHIP_TIERS.quarterly.label}</span>
                <span className="tag">Popular</span>
              </div>
              <p className="amount">{rupees(MEMBERSHIP_TIERS.quarterly.pricePaise)}</p>
              <p className="per">{MEMBERSHIP_TIERS.quarterly.days} days, unlimited</p>
              <ul>
                <li>As many calls as you want</li>
                <li>Any expert on the platform</li>
                <li>Your own console</li>
              </ul>
              <div className="price-foot">
                <PassPurchase
                  tier="quarterly"
                  label={MEMBERSHIP_TIERS.quarterly.label}
                  priceLabel={rupees(MEMBERSHIP_TIERS.quarterly.pricePaise)}
                  cta="Get quarterly"
                  className="b b-fill"
                />
              </div>
            </div>

            <div className="price">
              <div className="price-name">
                <span className="eyebrow">{MEMBERSHIP_TIERS.annual.label}</span>
              </div>
              <p className="amount">{rupees(MEMBERSHIP_TIERS.annual.pricePaise)}</p>
              <p className="per">{MEMBERSHIP_TIERS.annual.days} days, unlimited</p>
              <ul>
                <li>As many calls as you want</li>
                <li>Any expert on the platform</li>
                <li>Your own console</li>
              </ul>
              <div className="price-foot">
                <PassPurchase
                  tier="annual"
                  label={MEMBERSHIP_TIERS.annual.label}
                  priceLabel={rupees(MEMBERSHIP_TIERS.annual.pricePaise)}
                  cta="Get annual"
                  className="b b-line"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="band alt" id="faq">
        <div className="wrap">
          <div className="band-head">
            <span className="eyebrow">Frequently asked</span>
            <h2>Still curious?</h2>
          </div>
          <div className="faq">
            <details>
              <summary>Do I need to share my demat login?</summary>
              <p>
                No. You share a summary of your holdings during intake — never login credentials.
                There is no field anywhere on Bluepoint that accepts one.
              </p>
            </details>
            <details>
              <summary>Do experts give stock tips?</summary>
              <p>
                No. Experts review your existing portfolio and F&amp;O approach. They do not
                recommend specific trades, and nothing said on a call is personalised investment
                advice.
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
              <summary>Can I book the same expert again?</summary>
              <p>
                Yes — the {BUNDLE_CREDITS}-call bundle keeps you with the same expert across
                sessions.
              </p>
            </details>
            <details>
              <summary>What if I am not satisfied with the call?</summary>
              <p>
                Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> within 24 hours and we
                will arrange a follow-up or a refund, case by case.
              </p>
            </details>
            <details>
              <summary>What happens to my portfolio details afterwards?</summary>
              <p>
                They go only to the expert you booked, and are deleted {INTAKE_RETENTION_DAYS} days
                after the call — along with whatever your expert wrote up afterwards.
              </p>
            </details>
          </div>
        </div>
      </section>

      <section className="band closer">
        <div className="wrap">
          <h2>One call. One honest read.</h2>
          <p className="triple">You book. They look. You decide.</p>
          <div className="b-pair">
            <a className="b b-fill" href="#experts">
              Browse experts
            </a>
            <a className="b b-line" href="#pricing">
              See pricing
            </a>
          </div>
        </div>
      </section>

      <SiteFooter onLanding />
    </div>
  );
}
