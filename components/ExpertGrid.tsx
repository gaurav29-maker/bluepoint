"use client";

import { useState } from "react";
import BookingDialog from "./BookingDialog";

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
}: {
  experts: ExpertCard[];
  dbReady: boolean;
}) {
  const [booking, setBooking] = useState<ExpertCard | null>(null);

  if (experts.length === 0) {
    return (
      <div className="bp-empty">
        {dbReady || process.env.NODE_ENV === "production" ? (
          // Setup instructions are for whoever is running this locally, never
          // for a visitor on the live site.
          <p>No experts are listed yet. Check back shortly.</p>
        ) : (
          <p>
            <strong>No database connected.</strong> Set <code>DATABASE_URL</code> in{" "}
            <code>.env.local</code>, then run <code>npm run db:push</code> and{" "}
            <code>npm run db:seed</code>.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="expert-grid">
        {experts.map((e) => (
          <div className="expert-card" key={e.slug}>
            <div className="expert-photo">{e.initials}</div>
            <p className="expert-name">{e.displayName}</p>
            <p className="expert-tag">{e.headline}</p>

            {/*
              Laid out as a record rather than a paragraph: label on the left,
              value on the right, figures in a mono so rates line up down the
              column of cards. The SEBI row is always present — an expert with
              no registration shows "Not registered" rather than the row simply
              vanishing, which is what the terms already commit to.
            */}
            <dl className="expert-fields">
              <div>
                <dt>Rate</dt>
                <dd className="expert-rate">
                  {rupees(e.pricePaise)} <span>/ call</span>
                </dd>
              </div>
              <div>
                <dt>SEBI</dt>
                <dd>
                  {e.sebiRegType !== "none" && e.sebiRegNumber ? (
                    <>
                      {e.sebiRegType.toUpperCase()} · {e.sebiRegNumber}
                    </>
                  ) : (
                    <span className="expert-none">Not registered</span>
                  )}
                </dd>
              </div>
            </dl>

            <button className="expert-book" onClick={() => setBooking(e)}>
              Book a call
            </button>
          </div>
        ))}
      </div>

      {booking ? <BookingDialog expert={booking} onClose={() => setBooking(null)} /> : null}
    </>
  );
}
