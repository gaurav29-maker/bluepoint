import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Bluepoint",
  description: "What Bluepoint collects, who sees it, and when it is deleted.",
};

const TODO = ({ children }: { children: React.ReactNode }) => (
  <span className="legal-todo">{children}</span>
);

export default function Privacy() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="updated">Draft of 8 September 2026</p>

      <div className="legal-draft">
        <b>This draft has not been reviewed by a lawyer.</b>
        It is an accurate description of what the software actually collects and deletes, written
        against the Digital Personal Data Protection Act, 2023. It still needs review, and every
        bracketed item needs a real answer, before Bluepoint accepts real money.
      </div>

      <h2>The short version</h2>
      <p>
        We collect your name, email, an optional phone number, and the portfolio summary you write
        in the intake form. Your portfolio summary goes to one person: the expert you booked. It is
        deleted 90 days after your call. We never see your card details, and we never ask for a
        broker login.
      </p>

      <h2>1. Who is responsible</h2>
      <p>
        The Data Fiduciary is <TODO>[registered entity name and address]</TODO>. For anything in
        this policy, contact <TODO>[Data Protection Officer or grievance contact]</TODO>.
      </p>

      <h2>2. What we collect, and why</h2>
      <ul>
        <li>
          <strong>Name and email</strong> — to confirm your booking, send reminders, and give the
          expert someone to expect. Required.
        </li>
        <li>
          <strong>Phone number</strong> — optional, used only if we need to reach you about a
          session.
        </li>
        <li>
          <strong>Your portfolio summary, goals, risk comfort and questions</strong> — so the expert
          arrives already knowing your situation. This is the point of the intake form.
        </li>
        <li>
          <strong>Payment records</strong> — the amount, the time and Razorpay&rsquo;s reference for it.
          Card, UPI and bank details are handled by Razorpay and never reach us.
        </li>
        <li>
          <strong>Your consent record</strong> — the time you accepted the disclaimer, and the IP
          address it came from, because we may need to show it was given.
        </li>
      </ul>

      <h2>3. What we never collect</h2>
      <p>
        <strong>Demat, broker or trading account credentials.</strong> There is no field for one
        anywhere in the product or in our database. Nobody at Bluepoint will ever ask you for one.
      </p>

      <h2>4. Who sees your data</h2>
      <ul>
        <li>
          <strong>The expert you booked</strong> — your name and your intake form. No other expert
          sees it.
        </li>
        <li>
          <strong>Razorpay</strong>, to take the payment.{" "}
          <TODO>[link Razorpay&rsquo;s privacy policy]</TODO>
        </li>
        <li>
          <strong>Resend</strong>, to deliver email. <TODO>[link Resend&rsquo;s privacy policy]</TODO>
        </li>
        <li>
          <strong>Vercel and <TODO>[database provider]</TODO></strong>, who host the site and store
          the data.
        </li>
      </ul>
      <p>We do not sell your data, and we do not share it for anyone else&rsquo;s advertising.</p>

      <h2>5. How long we keep it</h2>
      <ul>
        <li>
          <strong>Intake forms are deleted 90 days after the call.</strong> This is automatic, not a
          promise we have to remember to keep — a scheduled job erases the content and leaves only
          the fact that a session happened.
        </li>
        <li>
          <strong>Booking and payment records</strong> are kept for{" "}
          <TODO>[N years, per tax and accounting requirements]</TODO>.
        </li>
        <li>
          <strong>Consent records</strong> are kept as long as the booking record they belong to.
        </li>
      </ul>

      <h2>6. Your rights</h2>
      <p>Under the DPDP Act you can ask us to:</p>
      <ul>
        <li>tell you what we hold about you and who we have shared it with;</li>
        <li>correct anything inaccurate or incomplete;</li>
        <li>erase your data where we no longer need it;</li>
        <li>nominate someone to exercise these rights if you cannot.</li>
      </ul>
      <p>
        Write to <TODO>[grievance contact]</TODO>. We aim to respond within{" "}
        <TODO>[N]</TODO> days. If we cannot resolve it, you may complain to the Data Protection
        Board of India.
      </p>

      <h2>7. Withdrawing consent</h2>
      <p>
        You can withdraw consent at any time by writing to us. We will delete what we are not
        legally required to keep. Withdrawing consent does not undo anything done while it was
        given, and we may not be able to deliver a session you have already booked.
      </p>

      <h2>8. Cookies and tracking</h2>
      <p>
        Bluepoint currently runs <strong>no analytics and no advertising trackers</strong>. The site
        stores nothing in your browser beyond what a page needs to work. If that changes, this
        section changes with it, and we will ask for consent where consent is required.
      </p>

      <h2>9. Security</h2>
      <p>
        Data is encrypted in transit. Access to the database is restricted to{" "}
        <TODO>[who]</TODO>. Intake links are signed so they cannot be guessed. No system is
        perfectly secure, and if a breach affects you we will tell you and the Data Protection
        Board as the Act requires.
      </p>

      <h2>10. Children</h2>
      <p>Bluepoint is not for anyone under 18, and we do not knowingly collect their data.</p>

      <h2>11. Changes</h2>
      <p>
        If we change this policy we will post the new version here and, for anything significant,
        email you.
      </p>
    </>
  );
}
