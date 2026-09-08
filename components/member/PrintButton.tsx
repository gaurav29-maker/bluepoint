"use client";

export default function PrintButton() {
  return (
    <button className="ops-btn" type="button" onClick={() => window.print()}>
      Print or save as PDF
    </button>
  );
}
