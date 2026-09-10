import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/constants";

export default function SiteFooter({ onLanding = false }: { onLanding?: boolean }) {
  const to = (hash: string) => (onLanding ? hash : `/${hash}`);

  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-grid">
          <div className="foot-col">
            <h4>Navigate</h4>
            <a href={to("#experts")}>Experts</a>
            <a href={to("#how")}>How it works</a>
            <a href={to("#pricing")}>Pricing</a>
            <a href={to("#faq")}>FAQs</a>
            <Link href="/member/login">Bluepoint OS</Link>
          </div>
          {/*
            One real destination beats three that go nowhere. Instagram and
            LinkedIn come back when those accounts exist — an empty profile
            behind a footer link is worse than no link.
          */}
          <div className="foot-col">
            <h4>Get in touch</h4>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </div>
          <div className="foot-col">
            <h4>Useful links</h4>
            <Link href="/legal/terms">Terms &amp; Conditions</Link>
            <Link href="/legal/privacy">Privacy Policy</Link>
            <Link href="/legal/refunds">Refund Policy</Link>
          </div>
          <div className="foot-col">
            <h4>Are you an expert?</h4>
            <p className="foot-note">
              Take calls on Bluepoint. You set your own rate and your own hours.
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
          Bluepoint sessions are a review and discussion of your existing portfolio and approach.
          They are not a recommendation to buy or sell any security, and are not personalised
          investment advice. You remain responsible for your own decisions.
        </p>
        <p className="copy">© 2026 Bluepoint. All rights reserved.</p>
      </div>
    </footer>
  );
}
