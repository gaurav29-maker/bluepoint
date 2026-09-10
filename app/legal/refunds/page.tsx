import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy — Bluepoint",
  description: "When Bluepoint refunds a session, and how long it takes.",
};

const TODO = ({ children }: { children: React.ReactNode }) => (
  <span className="todo">{children}</span>
);

export default function Refunds() {
  return (
    <>
      <h1>Refund Policy</h1>
      <p className="updated">Draft of 8 September 2026</p>

      <div className="draft">
        <b>This draft has not been reviewed by a lawyer.</b>
        Every rule below matches what the software actually does today. It still needs review, and
        the bracketed items need real answers, before Bluepoint accepts real money.
      </div>

      <h2>The short version</h2>
      <p>
        Cancel more than 24 hours ahead and you get everything back. If we cannot deliver the
        session, you get everything back without asking. If the call happened but was not worth
        your money, tell us within 24 hours and we will make it right.
      </p>

      <h2>1. You cancel</h2>
      <ul>
        <li>
          <strong>More than 24 hours before the call</strong> — full refund, no questions.
        </li>
        <li>
          <strong>Between 24 and 2 hours before</strong> — you may move the session once to any
          open slot at no cost. If you would rather have the money back, we refund{" "}
          <TODO>[50%? state the figure]</TODO>, because the expert has held the time.
        </li>
        <li>
          <strong>Less than 2 hours before, or you do not turn up</strong> — no refund. The
          expert has kept the slot and prepared from your intake form.
        </li>
      </ul>

      <h2>2. We cannot deliver</h2>
      <p>These are refunded in full, and you should not have to ask:</p>
      <ul>
        <li>
          <strong>The expert does not turn up</strong>, or cancels. Full refund, and we will help
          you rebook with someone else.
        </li>
        <li>
          <strong>Your payment landed after the slot had gone.</strong> If payment completes after
          your ten-minute hold lapsed and somebody else has taken the time, our system refunds you
          automatically and emails you to say so. We do not keep money for a call we cannot honour.
        </li>
        <li>
          <strong>A technical failure on our side</strong> stops the call happening.
        </li>
      </ul>

      <h2>3. The call happened but was not worth it</h2>
      <p>
        Tell us within <strong>24 hours</strong> at <TODO>[support email]</TODO> and say what went
        wrong. We will offer a follow-up session with the same or a different expert, or a refund.
        We look at these case by case and we would rather resolve it than argue about it.
      </p>
      <p>
        What this does not cover: a refund because the market moved against you, or because you
        disagreed with the expert&rsquo;s reading of your portfolio. The session is a considered opinion
        and a discussion, not a prediction, and never a guarantee of any outcome.
      </p>

      <h2>4. Bundles</h2>
      <ul>
        <li>A three-call bundle is valid for 60 days from purchase.</li>
        <li>
          Unused calls can be refunded within <TODO>[N]</TODO> days of purchase, at the single-call
          price for any call you have already taken, with the balance returned.
        </li>
        <li>
          Credits left unused when the 60 days expire are not refundable, and we will email you
          before that happens.
        </li>
      </ul>

      <h2>5. How long refunds take</h2>
      <p>
        We start a refund through Razorpay as soon as it is agreed. It typically reaches your
        account in <strong>5 to 7 working days</strong>, depending on your bank. It goes back to the
        method you paid with — we cannot send it anywhere else.
      </p>

      <h2>6. Asking for a refund</h2>
      <p>
        Email <TODO>[support email]</TODO> from the address you booked with, with the date of the
        session. We aim to reply within 48 hours.
      </p>

      <h2>7. Disputes</h2>
      <p>
        If you are not happy with how we handled a refund, escalate to{" "}
        <TODO>[grievance officer name and email]</TODO>.
      </p>
    </>
  );
}
