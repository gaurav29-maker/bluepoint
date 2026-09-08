import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions — Bluepoint",
  description: "The terms on which Bluepoint sessions are booked and delivered.",
};

const TODO = ({ children }: { children: React.ReactNode }) => (
  <span className="legal-todo">{children}</span>
);

export default function Terms() {
  return (
    <>
      <h1>Terms &amp; Conditions</h1>
      <p className="updated">Draft of 8 September 2026</p>

      <div className="legal-draft">
        <b>This draft has not been reviewed by a lawyer.</b>
        It describes what Bluepoint actually does today and is written to be accurate, not to be
        sufficient. Every bracketed item needs a real answer, and the whole document needs review
        by someone qualified in Indian securities and consumer law before Bluepoint accepts real
        money. Delete this notice once that has happened.
      </div>

      <h2>1. Who we are</h2>
      <p>
        Bluepoint is operated by <TODO>[registered entity name, CIN and address]</TODO> (&ldquo;Bluepoint&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;). You can reach us at <TODO>[support email]</TODO>.
      </p>

      <h2>2. What Bluepoint is</h2>
      <p>
        Bluepoint is a marketplace. We introduce you to independent experts and handle scheduling
        and payment for a 45-minute session. The session itself is between you and that expert.
      </p>
      <p>
        <strong>What happens on a call is a review and a discussion.</strong> An expert may look at
        the portfolio summary you provide, talk through concentration, position sizing and risk, and
        describe how they would think about a problem. That is the product.
      </p>

      <h2>3. What Bluepoint is not</h2>
      <p>These points are the substance of this agreement, not boilerplate:</p>
      <ul>
        <li>
          Nothing said on a Bluepoint call is <strong>personalised investment advice</strong>, and
          nothing is a recommendation to buy, sell or hold any specific security.
        </li>
        <li>Experts do not give tips, targets, or trade calls.</li>
        <li>
          No outcome is promised. Markets fall as well as rise, and losses in futures and options
          can exceed the amount you put in.
        </li>
        <li>
          Bluepoint does not handle, hold, manage or have any access to your money or your
          securities.
        </li>
        <li>
          Bluepoint itself is <TODO>[confirm: not registered with SEBI in any capacity — state the
          actual position here]</TODO>. Where an individual expert holds a SEBI registration as an
          Investment Adviser or Research Analyst, that registration number is shown on their
          profile. Where no number is shown, no registration is claimed.
        </li>
        <li>
          Registration with SEBI, where it exists, does not amount to any guarantee of returns or
          of performance.
        </li>
      </ul>

      <h2>4. Eligibility</h2>
      <p>
        You must be at least 18 and legally able to enter a contract in India. You agree that the
        information you give us — including your portfolio summary — is your own and is accurate to
        the best of your knowledge.
      </p>

      <h2>5. Booking and payment</h2>
      <ul>
        <li>Prices are shown before you book and are charged in Indian rupees.</li>
        <li>
          Payment is processed by Razorpay. We never see or store your card, UPI or netbanking
          details.
        </li>
        <li>
          Selecting a slot holds it for ten minutes. If payment does not complete in that window
          the slot is released to other customers.
        </li>
        <li>
          A booking is confirmed only when payment is confirmed to us by Razorpay. If your payment
          arrives after the slot has gone to someone else, we refund it in full automatically — see
          the <a href="/legal/refunds">Refund Policy</a>.
        </li>
      </ul>

      <h2>6. Never share your login</h2>
      <p>
        <strong>We will never ask for your demat, broker or trading account credentials</strong>, and
        neither will an expert. There is no field anywhere on Bluepoint that accepts one. If anyone
        claiming to be from Bluepoint asks for a login, an OTP, or remote access to your device,
        it is not us — stop, and tell us at <TODO>[support email]</TODO>.
      </p>

      <h2>7. Experts</h2>
      <p>
        We review an expert&rsquo;s background before listing them. That review is not a guarantee of
        the quality, accuracy or suitability of anything they say. Experts are independent and are
        not our employees or agents.
      </p>

      <h2>8. Your conduct</h2>
      <p>
        Sessions are for your own use. Do not record a call without the expert&rsquo;s consent, resell
        or redistribute what happens on one, or use Bluepoint to solicit business from experts
        outside the platform.
      </p>

      <h2>9. Cancellation</h2>
      <p>
        Set out in full in the <a href="/legal/refunds">Refund Policy</a>, which forms part of these
        terms.
      </p>

      <h2>10. Liability</h2>
      <p>
        To the extent Indian law allows, our total liability to you for any claim connected with a
        session is limited to the amount you paid for that session. We are not liable for
        investment losses, or for decisions you take after a call. Nothing here limits liability
        for fraud, or for anything that cannot lawfully be limited.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may change these terms. The version that applies to a booking is the one published when
        you made it.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These terms are governed by the laws of India, and the courts at{" "}
        <TODO>[city of the registered office]</TODO> have exclusive jurisdiction.
      </p>

      <h2>13. Grievances</h2>
      <p>
        Write to <TODO>[grievance officer name and email, as required under the Consumer Protection
        (E-Commerce) Rules 2020]</TODO>. We aim to acknowledge within 48 hours and resolve within
        <TODO>[N]</TODO> days.
      </p>
    </>
  );
}
