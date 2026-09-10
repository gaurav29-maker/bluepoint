"use client";

import { useState } from "react";
import BookingDialog from "./BookingDialog";
import type { ExpertCard } from "./ExpertGrid";

/**
 * One expert, one button, the same dialog the home page grid opens. The
 * booking flow has exactly one implementation — a second one would be a
 * second place for the price, the disclaimer and the hold to drift.
 */
export default function ExpertBooking({
  expert,
  label = "Book a call",
  className = "b b-fill",
}: {
  expert: ExpertCard;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open ? <BookingDialog expert={expert} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
