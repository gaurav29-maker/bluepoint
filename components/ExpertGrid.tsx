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
            {e.sebiRegType !== "none" && e.sebiRegNumber ? (
              <p className="expert-sebi">
                SEBI {e.sebiRegType.toUpperCase()} · {e.sebiRegNumber}
              </p>
            ) : null}
            <div className="expert-meta">
              <p className="expert-rate">
                {rupees(e.pricePaise)} <span>/ 45 min</span>
              </p>
              <button className="expert-book" onClick={() => setBooking(e)}>
                Book
              </button>
            </div>
          </div>
        ))}
      </div>

      {booking ? <BookingDialog expert={booking} onClose={() => setBooking(null)} /> : null}
    </>
  );
}
