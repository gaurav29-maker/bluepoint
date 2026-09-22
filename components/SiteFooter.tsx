import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/constants";

export default function SiteFooter({ onLanding = false }: { onLanding?: boolean }) {
  const to = (hash: string) => (onLanding ? hash : `/${hash}`);

  return (
    <footer className="foot">
      <div className="wrap">
        {/*
          The site has never said why it is called Landline. A brand name
          nobody explains is just a word, and this is the one place a visitor
          has already come looking for who we are.
        
          It stays a statement about the shape of the thing — one person, one
          line, nothing in between — and never a claim about outcomes.
        */}
        <div className="foot-brand">
          <span className="mark">
            Land<span>line</span>
          </span>
          <p>
            A direct line to a market professional. You pick the person and you pick the time,
            and they have read your portfolio before you speak. No forwarded screenshot, no
            broadcast channel, nobody in between.
          </p>
        </div>
                <div className="foot-grid">
          <div className="foot-col">
            <h2 className="foot-h">Navigate</h2>
            <Link href="/experts">Find an expert</Link>
            <a href={to("#audit")}>Audit my portfolio</a>
            <a href={to("#ways")}>Packages</a>
            <a href={to("#how")}>How it works</a>
            <a href={to("#faq")}>FAQs</a>
            <Link href="/member/login">Landline OS</Link>
          </div>
          {/*
            One real destination beats three that go nowhere. Instagram and
            LinkedIn come back when those accounts exist — an empty profile
            behind a footer link is worse than no link.
          */}
          <div className="foot-col">
            <h2 className="foot-h">Get in touch</h2>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </div>
          <div className="foot-col">
            <h2 className="foot-h">Useful links</h2>
            <Link href="/legal/terms">Terms &amp; Conditions</Link>
            <Link href="/legal/privacy">Privacy Policy</Link>
            <Link href="/legal/refunds">Refund Policy</Link>
          </div>
          <div className="foot-col">
            <h2 className="foot-h">Are you an expert?</h2>
            <p className="foot-note">
              Take calls on Landline. You set your own rate and your own hours.
            </p>
            <Link className="b b-line b-sm" href="/apply">
              Apply now
            </Link>
          </div>
        </div>
        {/*
          The disclaimer sits on every public page, not only the home page.
          It is the statement the terms rest on, and a visitor who lands
          straight on an expert's page has to meet it too.
        */}
        <p className="disclaim">
          Landline sessions are a review and discussion of your existing portfolio and approach.
          They are not a recommendation to buy or sell any security, and are not personalised
          investment advice. You remain responsible for your own decisions.
        </p>
        <p className="copy">© 2026 Landline. All rights reserved.</p>
      </div>
    </footer>
  );
}
