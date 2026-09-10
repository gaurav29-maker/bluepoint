import type { Metadata } from "next";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import ApplyForm from "@/components/ApplyForm";
import { rupees } from "@/lib/format";
import { SINGLE_CALL_PAISE } from "@/lib/constants";
import { SLOT_MINUTES } from "@/lib/slots";

export const metadata: Metadata = {
  title: "Take calls on Bluepoint",
  description:
    "Be useful and paid, without taking on a client, a mandate or a compliance burden. Set your own rate and your own hours.",
};

export default function Apply() {
  return (
    <div className="site">
      <SiteNav />

      <div className="wrap">
        <div className="doc">
          <h1 className="doc-name">Be useful, and paid, without taking on a client.</h1>
          <p className="doc-lede">
            People arrive having already written down what they hold and what they are worried
            about. You read it before the call, spend {SLOT_MINUTES} minutes telling them what you
            see in it, and that is the whole job. No mandate, no onboarding, no ongoing obligation
            to anybody.
          </p>

          {/*
            The pitch before the terms. Somebody who has run institutional
            money is not short of things to do — the question this page has to
            answer is why they would spend an hour here, and the honest answer
            is that everything that usually makes this work expensive has been
            removed.
          */}
          <section className="doc-sec">
            <h2 className="doc-h2">Why you might want this</h2>
            <ul className="ul">
              <li>
                <b>No client relationship.</b> No mandate to sign, no assets to take on, no KYC
                pack, nobody calling you in March. One conversation, ended.
              </li>
              <li>
                <b>Your rate, your hours.</b> You set both yourself and change them whenever you
                like. Sessions currently list from {rupees(SINGLE_CALL_PAISE)}. Pausing yourself
                takes one click and hides you from the site immediately.
              </li>
              <li>
                <b>They come prepared.</b> Holdings and the actual question are in your hands before
                the call, so you spend the time on the problem instead of twenty minutes finding out
                what it is.
              </li>
              <li>
                <b>Nothing to sell.</b> You are not distributing a product, and no part of your pay
                depends on what anyone buys. That is the entire premise of the platform.
              </li>
            </ul>
          </section>

          <section className="doc-sec">
            <h2 className="doc-h2">And what it is not</h2>
            <ul className="ul">
              <li>
                <b>It is not a lot of money per hour.</b> If your time is worth far more than this,
                that is a fair reason to say no.
              </li>
              <li>
                <b>No tips, no targets, no personalised advice.</b> Bluepoint sessions are a review
                and a discussion. That is what customers are told, and it is what the terms commit
                us to.
              </li>
              <li>
                <b>No selling.</b> Not your fund, not your newsletter, not anyone else&rsquo;s
                product. A session that ends in a pitch is the one thing that gets an expert
                removed.
              </li>
              <li>
                <b>You show up.</b> Someone paid for that time and wrote out their holdings for it.
              </li>
            </ul>
          </section>

          {/*
            Stated plainly because it is the reason to be on this platform
            rather than a directory. An expert whose background nobody checked
            is worth nothing to the expert whose background is real.
          */}
          <section className="doc-sec">
            <h2 className="doc-h2">What we check before you are listed</h2>
            <ul className="ul">
              <li>
                <b>Where you have worked.</b> A person reads it and checks it. It is published on
                your profile in your own words, and you cannot edit it afterwards — a fact you could
                rewrite is not one anyone checked.
              </li>
              <li>
                <b>Your SEBI registration, or its absence.</b> Either answer is fine. Whichever you
                give is shown on your profile exactly as it stands, and verified against the
                register before you go live.
              </li>
              <li>
                <b>That you set your hours.</b> You are published once there is availability behind
                the profile, not the moment you are approved.
              </li>
            </ul>
          </section>

          <section className="doc-sec">
            <h2 className="doc-h2">Apply</h2>
            <ApplyForm />
          </section>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
