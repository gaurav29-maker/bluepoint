"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export type Tier = "quarterly" | "annual";

export default function PassPurchase({
  tier,
  label,
  priceLabel,
  cta,
  className,
}: {
  tier: Tier;
  label: string;
  priceLabel: string;
  cta: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      // Only the tier name goes up. The price is read from the server.
      const res = await fetch("/api/memberships/purchase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tier,
          name,
          email,
          phone: phone || undefined,
          disclaimerAccepted: true,
        }),
      });
      const order = await res.json();
      if (!res.ok) throw new Error(order.error ?? "Could not start payment");

      const ready = await loadRazorpay();
      if (!ready || !window.Razorpay) throw new Error("Payment could not load.");

      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: "INR",
        name: "Bluepoint",
        description: order.description,
        prefill: order.prefill,
        theme: { color: "#1D9BF0" },
        // The webhook activates the pass; this only moves the browser on.
        handler: () => {
          window.location.href = "/member/login?sent=0&bought=1";
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setError("Payment was cancelled.");
          },
        },
      });
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  const canBuy = name.trim() !== "" && /.+@.+\..+/.test(email) && accepted && !busy;

  return (
    <>
      <button className={className ?? "price-cta"} onClick={() => setOpen(true)}>
        {cta}
      </button>

      {open ? (
        <div className="bp-backdrop" onClick={() => setOpen(false)} role="presentation">
          <div
            className="bp-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={label}
          >
            <div className="bp-dialog-head">
              <div>
                <p className="bp-dialog-title">{label}</p>
                <p className="bp-dialog-sub">{priceLabel} · unlimited sessions, any expert</p>
              </div>
              <button className="bp-close" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="bp-body">
              <label className="bp-field">
                <span>Your name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </label>
              <label className="bp-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>
              <label className="bp-field">
                <span>
                  Phone <em>optional</em>
                </span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              </label>

              <label className="bp-check">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                <span>
                  I understand these sessions are a review and discussion, not personalised
                  investment advice or a recommendation to buy or sell any security.
                </span>
              </label>

              {error ? <p className="bp-error">{error}</p> : null}

              <button className="btn-primary bp-full" disabled={!canBuy} onClick={buy}>
                {busy ? "Working…" : `Pay ${priceLabel}`}
              </button>
              <p className="bp-fineprint">
                Your console link is emailed to this address once payment clears.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
