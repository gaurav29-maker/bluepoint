import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { experts as expertsTable } from "@/lib/db/schema";
import Link from "next/link";
import ExpertGrid, { type ExpertCard } from "@/components/ExpertGrid";
import PassPurchase from "@/components/PassPurchase";

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

async function loadExperts(): Promise<{ experts: ExpertCard[]; dbReady: boolean }> {
  try {
    const rows = await db
      .select({
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
    return { experts: rows, dbReady: true };
  } catch {
    // No database yet. Render the page rather than a stack trace.
    return { experts: [], dbReady: false };
  }
}

export default async function Home() {
  const { experts, dbReady } = await loadExperts();

  return (
    <div className="site-dark">
      <nav>
        <div className="nav-inner">
          <div className="logo">
            blue<span>point</span>
          </div>
          <div className="nav-links">
            <a href="#experts">Experts</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQs</a>
          </div>
          <div className="nav-right">
            <Link className="nav-os" href="/member/login">
              Bluepoint OS
            </Link>
            <a className="nav-cta" href="#experts">
              Book a call
            </a>
          </div>
        </div>
      </nav>

      <div className="wrap">
        <div className="hero">
          <div>
            <span className="eyebrow-pill">One-to-one calls with vetted experts</span>
            <h1>
              Get a <span className="said">fix</span> on your position, before the market does.
            </h1>
            <p className="sub">
              Book a call with a market expert. A straight read on what you hold, or a system for
              sizing your F&O trades instead of guessing. No pitch at the end of the call.
            </p>
            <div className="cta-row">
              <a className="btn-primary" href="#experts">
                Browse experts
              </a>
              <a className="btn-ghost" href="#how">
                How it works
              </a>
            </div>
            <div className="trust-avatars">
              <div className="avatar-stack">
                {experts.slice(0, 3).map((e) => (
                  <div className="av" key={e.slug}>
                    {e.initials}
                  </div>
                ))}
              </div>
              <span className="label">
                {experts.length > 0
                  ? `${experts.length} expert${experts.length === 1 ? "" : "s"} available`
                  : "Experts joining soon"}
              </span>
            </div>
          </div>
        </div>

        <div className="logo-strip">
          <span className="tag">Built for traders using</span>
          <div className="marquee">
            <div className="marquee-track">
              {[...BROKERS, ...BROKERS].map((b, i) => (
                <span key={`${b}-${i}`}>{b}</span>
              ))}
            </div>
          </div>
        </div>

        <section id="experts">
          <div className="section-head">
            <p className="section-eyebrow">Our Experts</p>
            <h2>
              Pick an expert who <span className="said">fits</span> your portfolio
            </h2>
            <p>Every expert shows their SEBI registration, or says plainly that they have none.</p>
          </div>
          <ExpertGrid experts={experts} dbReady={dbReady} />
        </section>

        <section id="how" className="tight">
          <div className="section-head">
            <p className="section-eyebrow">Process</p>
            <h2>
              Your review, <span className="said">effortlessly</span>.
            </h2>
            <p>Begin in four simple steps — no back-and-forth scheduling emails.</p>
          </div>
          <div className="process-steps">
            <div className="process-step">
              <div className="process-num">01</div>
              <h3>Choose expert</h3>
              <p>Pick based on specialty, rate, and experience.</p>
            </div>
            <div className="process-step">
              <div className="process-num">02</div>
              <h3>Pick a slot</h3>
              <p>See real-time availability, book instantly.</p>
            </div>
            <div className="process-step">
              <div className="process-num">03</div>
              <h3>Pay & confirm</h3>
              <p>Secure payment via Razorpay, instant confirmation.</p>
            </div>
            <div className="process-step">
              <div className="process-num">04</div>
              <h3>Share your portfolio</h3>
              <p>Fill a short intake form before your call.</p>
            </div>
          </div>
          <a className="btn-ghost" href="#experts">
            Book now
          </a>
        </section>

        <section>
          <div className="section-head">
            <p className="section-eyebrow">Why us</p>
            <h2>Reasons traders choose us</h2>
            <p>
              Most advice starts with what to buy. Bluepoint starts with what you already hold,
              and how far it has drifted from what you meant to hold.
            </p>
          </div>
          <div className="features-grid">
            <div className="feature-item">
              <div className="f-glyph"></div>
              <h3>Nobody here earns commission</h3>
              <p>
                Experts are paid per session. Not by a product, not by a distributor, not by
                anyone whose fund they might otherwise mention.
              </p>
            </div>
            <div className="feature-item">
              <div className="f-glyph"></div>
              <h3>The call is the product</h3>
              <p>
                There is nothing after it to sell you. No follow-up, no funnel, no second
                conversation you did not ask for.
              </p>
            </div>
            <div className="feature-item">
              <div className="f-glyph"></div>
              <h3>What you share, we delete</h3>
              <p>
                Ninety days after the call, automatically. The session stays on your record.
                What you told us does not.
              </p>
            </div>
            <div className="feature-item">
              <div className="f-glyph"></div>
              <h3>A system, not a signal</h3>
              <p>
                Position sizing and risk, examined properly. Not a trade to copy.
              </p>
            </div>
            <div className="feature-item">
              <div className="f-glyph"></div>
              <h3>You book a time, not a request</h3>
              <p>
                Slots are live. A held slot releases itself if payment does not complete, so
                nothing sits reserved against you.
              </p>
            </div>
            <div className="feature-item">
              <div className="f-glyph"></div>
              <h3>One price, stated once</h3>
              <p>
                Nothing is added at checkout. What you read is what you pay.
              </p>
            </div>
          </div>
        </section>

        <section id="pricing">
          <div className="section-head">
            <p className="section-eyebrow">Pricing</p>
            <h2>Simple, transparent pricing</h2>
            <p>Pay per call, or bundle for ongoing F&O guidance.</p>
          </div>
          <div className="pricing-grid is-four">
            <div className="price-card">
              <h3>Single call</h3>
              <p className="price-amount">
                ₹5,499 <span>/ call</span>
              </p>
              <p className="price-note">One session with an expert</p>
              <ul className="price-features">
                <li>Video call with an expert</li>
                <li>Written summary after</li>
                <li>Book with any expert</li>
              </ul>
              <a className="price-cta" href="#experts">
                Book now
              </a>
            </div>

            <div className="price-card">
              <h3>3-call bundle</h3>
              <p className="price-amount">
                ₹9,999 <span>/ 3 calls</span>
              </p>
              <p className="price-note">₹3,333 a call · valid 60 days</p>
              <ul className="price-features">
                <li>Three sessions</li>
                <li>Same expert every time</li>
                <li>Progress tracked across calls</li>
              </ul>
              <a className="price-cta" href="#experts">
                Get bundle
              </a>
            </div>

            <div className="price-card popular">
              <span className="price-badge">Most popular</span>
              <h3>Quarterly pass</h3>
              <p className="price-amount">
                ₹45,000 <span>/ 90 days</span>
              </p>
              <p className="price-note">Unlimited sessions</p>
              <ul className="price-features">
                <li>As many calls as you want</li>
                <li>Any expert on the platform</li>
                <li>Your own console</li>
              </ul>
              <PassPurchase
                tier="quarterly"
                label="Quarterly pass"
                priceLabel="₹45,000"
                cta="Get quarterly"
              />
            </div>

            <div className="price-card">
              <h3>Annual pass</h3>
              <p className="price-amount">
                ₹2,45,000 <span>/ year</span>
              </p>
              <p className="price-note">Unlimited sessions, all year</p>
              <ul className="price-features">
                <li>As many calls as you want</li>
                <li>Any expert on the platform</li>
                <li>Your own console</li>
              </ul>
              <PassPurchase
                tier="annual"
                label="Annual pass"
                priceLabel="₹2,45,000"
                cta="Get annual"
              />
            </div>
          </div>
        </section>

        <section id="faq" className="serif-head">
          <div className="section-head">
            <p className="section-eyebrow">Frequently asked questions</p>
            <h2>Still curious?</h2>
          </div>
          <div className="faq-list">
            <details className="faq-item">
              <summary>Do I need to share my demat login?</summary>
              <p>
                No. You only share a summary of your holdings during intake — never login
                credentials. There is no field anywhere on Bluepoint that accepts one.
              </p>
            </details>
            <details className="faq-item">
              <summary>What if I am not satisfied with the call?</summary>
              <p>Reach out within 24 hours and we will arrange a follow-up or refund, case by case.</p>
            </details>
            <details className="faq-item">
              <summary>Do experts give stock tips?</summary>
              <p>
                No. Experts review your existing portfolio and F&O approach — they do not recommend
                specific trades, and nothing said on a call is personalised investment advice.
              </p>
            </details>
            <details className="faq-item">
              <summary>Can I book the same expert again?</summary>
              <p>Yes — the 3-call bundle keeps you with the same expert across sessions.</p>
            </details>
            <details className="faq-item">
              <summary>What happens to my portfolio details afterwards?</summary>
              <p>
                They go only to the expert you booked, and are deleted 90 days after the call.
              </p>
            </details>
          </div>
        </section>

        <section>
          <div className="final-cta">
            <div>
              <h2>
                Find out exactly where you <span className="said">stand</span>.
              </h2>
              <p>One call. No pitch at the end of it, and nothing to buy.</p>
            </div>
            <div className="cta-row">
              <a className="btn-primary" href="#experts">
                Browse experts
              </a>
              <a className="btn-ghost" href="#pricing">
                See pricing
              </a>
            </div>
          </div>
        </section>
      </div>

      <footer>
        <div className="wrap">
          <div className="footer-grid">
            <div className="footer-col">
              <h4>Navigate</h4>
              <a href="#experts">Experts</a>
              <a href="#how">How it works</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQs</a>
              <Link href="/member/login">Bluepoint OS</Link>
            </div>
            <div className="footer-col">
              <h4>Get in touch</h4>
              <a href="#">Email</a>
              <a href="#">Instagram</a>
              <a href="#">LinkedIn</a>
            </div>
            <div className="footer-col">
              <h4>Useful links</h4>
              <Link href="/legal/terms">Terms &amp; Conditions</Link>
              <Link href="/legal/privacy">Privacy Policy</Link>
              <Link href="/legal/refunds">Refund Policy</Link>
            </div>
            <div className="footer-col">
              <div className="footer-recruit">
                <h4>Are you an expert?</h4>
                <p>Join the platform and help traders make sense of their portfolios.</p>
                <a className="footer-apply" href="#">
                  Apply now
                </a>
              </div>
            </div>
          </div>
          <p className="footer-disclaimer">
            Bluepoint sessions are a review and discussion of your existing portfolio and approach.
            They are not a recommendation to buy or sell any security, and are not personalised
            investment advice. You remain responsible for your own decisions.
          </p>
          <div className="footer-bottom">© 2026 Bluepoint. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
