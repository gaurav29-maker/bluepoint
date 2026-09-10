"use client";

import { useState } from "react";
import Link from "next/link";
import BookingDialog from "./BookingDialog";
import { SLOT_MINUTES } from "@/lib/slots";

export type ExpertCard = {
  slug: string;
  displayName: string;
  initials: string;
  headline: string;
  pricePaise: number;
  sebiRegType: "ria" | "ra" | "none";
  sebiRegNumber: string | null;
};

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function ExpertGrid({
  experts,
  dbReady,
  /** Slug -> "Thu, 11 Sept, from 10:00 am". Absent on pages that do not compute it. */
  nextAvailable,
}: {
  experts: ExpertCard[];
  dbReady: boolean;
  nextAvailable?: Record<string, string>;
}) {
  const [booking, setBooking] = useState<ExpertCard | null>(null);

  if (experts.length === 0) {
    return (
      <p className="band-empty">
        {dbReady || process.env.NODE_ENV === "production" ? (
          // Setup instructions are for whoever is running this locally, never
          // for a visitor on the live site.
          <>No experts are listed yet. Check back shortly.</>
        ) : (
          <>
            <strong>No database connected.</strong> Set <code>DATABASE_URL</code> in{" "}
            <code>.env.local</code>, then run <code>npm run db:push</code> and{" "}
            <code>npm run db:seed</code>.
          </>
        )}
      </p>
    );
  }

  return (
    <>
      <div className="grid3">
        {experts.map((e) => (
          <article className="xcard" key={e.slug}>
            {/*
              The card is the fast path; the profile is the considered one.
              Handing someone your portfolio off a headline and two initials
              is a lot to ask, so the name opens the page that says who they
              actually are — while "Book a call" still books in one click.
            */}
            <Link className="xlink" href={`/experts/${e.slug}`}>
              <div className="xcard-top">
                <div className="xav">{e.initials}</div>
                <div>
                  <h3>{e.displayName}</h3>
                  <p className="xrole">{e.headline}</p>
                </div>
              </div>
            </Link>

            {/*
              A record rather than a paragraph: label left, value right,
              figures in a mono so rates line up down the column of cards.
              The SEBI row is always present — an expert with no registration
              reads "Not registered" rather than the row simply vanishing,
              which is what the terms already commit to.
            */}
            <dl className="rec">
              <div>
                <dt>Rate</dt>
                <dd className="rate">
                  {rupees(e.pricePaise)} <small>/ call</small>
                </dd>
              </div>
              <div>
                <dt>Session</dt>
                <dd>{SLOT_MINUTES} min, video</dd>
              </div>
              {nextAvailable?.[e.slug] ? (
                <div>
                  <dt>Next</dt>
                  <dd>{nextAvailable[e.slug]}</dd>
                </div>
              ) : null}
              <div>
                <dt>SEBI</dt>
                <dd>
                  {e.sebiRegType !== "none" && e.sebiRegNumber ? (
                    <>
                      {e.sebiRegType.toUpperCase()} · {e.sebiRegNumber}
                    </>
                  ) : (
                    <span className="unreg">Not registered</span>
                  )}
                </dd>
              </div>
            </dl>

            <button className="b b-fill" onClick={() => setBooking(e)}>
              Book a call
            </button>
            <Link className="xmore" href={`/experts/${e.slug}`}>
              Read more about {e.displayName.split(" ")[0]}
            </Link>
          </article>
        ))}
      </div>

      {booking ? <BookingDialog expert={booking} onClose={() => setBooking(null)} /> : null}
    </>
  );
}
