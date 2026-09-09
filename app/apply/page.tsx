import type { Metadata } from "next";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import ApplyForm from "@/components/ApplyForm";
import { rupees } from "@/lib/format";
import { SINGLE_CALL_PAISE } from "@/lib/constants";
import { SLOT_MINUTES } from "@/lib/slots";

export const metadata: Metadata = {
  title: "Apply to take calls — Bluepoint",
  description:
    "Bluepoint lists a small number of experts who review portfolios and F&O positions for Indian retail traders.",
};

export default function Apply() {
  return (
    <div className="site-dark">
      <SiteNav />

      <div className="wrap">
        <div className="apply">
          <h1 className="apply-h1">Take calls on Bluepoint.</h1>
          <p className="apply-lede">
            People arrive having already written down what they hold and what they are worried
            about. You read it before the call, spend {SLOT_MINUTES} minutes telling them what you
            see in it, and that is the whole job.
          </p>

          {/*
            The terms first, before the form. Someone deciding whether to
            spend twenty minutes on an application deserves to know what the
            work is and what it pays before they start writing, not after.
          */}
          <section className="apply-section">
            <h2 className="apply-h2">What the work is</h2>
            <ul className="apply-terms">
              <li>
                <b>You set your own rate and hours.</b> Sessions currently list from{" "}
                {rupees(SINGLE_CALL_PAISE)}. You edit both yourself once you are live, and pausing
                yourself takes one click.
              </li>
              <li>
                <b>No selling.</b> Not your fund, not your newsletter, not anyone else&rsquo;s
                product. A session that ends in a pitch is the one thing that gets an expert
                removed.
              </li>
              <li>
                <b>No tips, no targets, no personalised advice.</b> Bluepoint sessions are a review
                and a discussion. That is what customers are told, and it is what the terms commit
                us to.
              </li>
              <li>
                <b>Your registration is published as it stands.</b> Registered or not, it is on your
                profile in plain words, and we verify it before you go live.
              </li>
              <li>
                <b>You show up.</b> Someone paid for that time and wrote out their holdings for it.
              </li>
            </ul>
          </section>

          <section className="apply-section">
            <h2 className="apply-h2">Apply</h2>
            <ApplyForm />
          </section>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
