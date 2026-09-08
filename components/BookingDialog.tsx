"use client";

import { useEffect, useMemo, useState } from "react";
import type { ExpertCard } from "./ExpertGrid";

type Slot = { startsAt: string; endsAt: string };
type Step = "picking" | "details" | "paying" | "done";
type Product = "single" | "bundle";

/** Display only — the server reads the real price from the database. */
const BUNDLE_PRICE_PAISE = 360000;
const BUNDLE_CREDITS = 3;

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const IST = "Asia/Kolkata";

function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
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

export default function BookingDialog({
  expert,
  onClose,
}: {
  expert: ExpertCard;
  onClose: () => void;
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [step, setStep] = useState<Step>("picking");
  const [product, setProduct] = useState<Product>("single");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/experts/${expert.slug}/slots`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load availability"))))
      .then((data: { slots: Slot[] }) => {
        if (cancelled) return;
        setSlots(data.slots);
        const first = data.slots[0];
        if (first) setActiveDay(dayLabel(first.startsAt));
      })
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [expert.slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots ?? []) {
      const key = dayLabel(s.startsAt);
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [slots]);

  async function confirm() {
    if (!chosen) return;
    setBusy(true);
    setSubmitError(null);

    try {
      const endpoint = product === "bundle" ? "/api/bundles/hold" : "/api/bookings/hold";
      const holdRes = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expertSlug: expert.slug,
          startsAt: chosen.startsAt,
          name,
          email,
          phone: phone || undefined,
          disclaimerAccepted: true,
        }),
      });
      const hold = await holdRes.json();
      if (!holdRes.ok) throw new Error(hold.error ?? "Could not hold that slot");

      const orderRes = await fetch("/api/payments/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId: hold.bookingId }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order.error ?? "Could not start payment");

      const ready = await loadRazorpay();
      if (!ready || !window.Razorpay) throw new Error("Payment could not load. Check your connection.");

      setStep("paying");

      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: "INR",
        name: "Bluepoint",
        description: order.description,
        prefill: order.prefill,
        theme: { color: "#387ED1" },
        // The webhook confirms the booking. This only moves the browser on.
        handler: () => {
          window.location.href = `/booking/${hold.bookingId}`;
        },
        modal: {
          ondismiss: () => {
            setStep("details");
            setBusy(false);
            setSubmitError("Payment was cancelled. Your slot is held for a few more minutes.");
          },
        },
      });
      rzp.open();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
      setStep("details");
    }
  }

  const days = [...byDay.keys()];
  const canConfirm = name.trim() !== "" && /.+@.+\..+/.test(email) && accepted && !busy;

  return (
    <div className="bp-backdrop" onClick={onClose} role="presentation">
      <div
        className="bp-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Book a call with ${expert.displayName}`}
      >
        <div className="bp-dialog-head">
          <div>
            <p className="bp-dialog-title">{expert.displayName}</p>
            <p className="bp-dialog-sub">
              45 minutes · {rupees(expert.pricePaise)} · times shown in IST
            </p>
          </div>
          <button className="bp-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {step === "picking" ? (
          <div className="bp-body">
            {loadError ? <p className="bp-error">{loadError}</p> : null}
            {slots === null && !loadError ? <p className="bp-muted">Loading availability…</p> : null}
            {slots !== null && slots.length === 0 ? (
              <p className="bp-muted">
                No open slots in the next three weeks. Try another expert.
              </p>
            ) : null}

            {days.length > 0 ? (
              <>
                <div className="bp-day-tabs">
                  {days.map((d) => (
                    <button
                      key={d}
                      className={`bp-day${d === activeDay ? " is-active" : ""}`}
                      onClick={() => setActiveDay(d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <div className="bp-slot-grid">
                  {(byDay.get(activeDay ?? "") ?? []).map((s) => (
                    <button
                      key={s.startsAt}
                      className={`bp-slot${chosen?.startsAt === s.startsAt ? " is-active" : ""}`}
                      onClick={() => setChosen(s)}
                    >
                      {timeLabel(s.startsAt)}
                    </button>
                  ))}
                </div>
                <button
                  className="btn-primary bp-full"
                  disabled={!chosen}
                  onClick={() => setStep("details")}
                >
                  {chosen ? `Continue · ${dayLabel(chosen.startsAt)}, ${timeLabel(chosen.startsAt)}` : "Pick a time"}
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {step === "details" || step === "paying" ? (
          <div className="bp-body">
            <div className="bp-product" role="radiogroup" aria-label="What you are buying">
              <button
                type="button"
                role="radio"
                aria-checked={product === "single"}
                className={`bp-product-opt${product === "single" ? " is-active" : ""}`}
                onClick={() => setProduct("single")}
              >
                <span className="bp-product-name">One call</span>
                <span className="bp-product-price">{rupees(expert.pricePaise)}</span>
                <span className="bp-product-note">A single 45-minute session</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={product === "bundle"}
                className={`bp-product-opt${product === "bundle" ? " is-active" : ""}`}
                onClick={() => setProduct("bundle")}
              >
                <span className="bp-product-name">{BUNDLE_CREDITS} calls</span>
                <span className="bp-product-price">{rupees(BUNDLE_PRICE_PAISE)}</span>
                <span className="bp-product-note">
                  Book the other two later · valid 60 days
                </span>
              </button>
            </div>

            <p className="bp-chosen">
              {chosen ? `${dayLabel(chosen.startsAt)} at ${timeLabel(chosen.startsAt)} IST` : ""}
              <button className="bp-change" onClick={() => setStep("picking")}>
                change
              </button>
            </p>

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
                I understand this session is a review and discussion, not personalised investment
                advice or a recommendation to buy or sell any security.
              </span>
            </label>

            {submitError ? <p className="bp-error">{submitError}</p> : null}

            <button className="btn-primary bp-full" disabled={!canConfirm} onClick={confirm}>
              {busy
                ? "Working…"
                : `Pay ${rupees(product === "bundle" ? BUNDLE_PRICE_PAISE : expert.pricePaise)}`}
            </button>
            <p className="bp-fineprint">
              You will never be asked for a demat or broker login — not here, and not on the call.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
