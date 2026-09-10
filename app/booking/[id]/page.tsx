"use client";

import { use, useEffect, useState } from "react";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

type Status = {
  id: string;
  status:
    | "held"
    | "confirmed"
    | "completed"
    | "no_show"
    | "cancelled"
    | "refunded"
    | "expired";
  startsAt: string;
  amountPaise: number;
  meetingUrl: string | null;
  expertName: string;
  expertNote: string | null;
  intakeDone: boolean;
  intakePath: string;
};

function istDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export default function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waited, setWaited] = useState(0);

  /**
   * The webhook confirms the booking, not the browser. So this page arrives
   * before confirmation and polls until Razorpay's callback has landed.
   */
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const res = await fetch(`/api/bookings/${id}`);
        if (!res.ok) throw new Error("We could not find that booking.");
        const json: Status = await res.json();
        if (stop) return;
        setData(json);
        if (json.status === "held") {
          setWaited((w) => w + 1);
          timer = setTimeout(tick, 2000);
        }
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "Something went wrong");
      }
    };

    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id]);

  return (
    <div className="site">
      <SiteNav />

      <div className="wrap">
        <div className="doc">

      {error ? <p className="err">{error}</p> : null}
      {!data && !error ? <p className="muted">Loading…</p> : null}

      {data?.status === "held" ? (
        <div className="panel">
          <h1>Confirming your payment…</h1>
          <p className="muted">
            This usually takes a few seconds. You do not need to pay again.
          </p>
          {waited > 15 ? (
            <p className="muted">
              Still waiting on the payment provider. If you were charged, your confirmation email
              will arrive shortly — nothing is lost.
            </p>
          ) : null}
        </div>
      ) : null}

      {data?.status === "confirmed" || data?.status === "completed" ? (
        <div className="panel">
          <h1>You are booked in.</h1>
          <p className="lede">
            Your session with <strong>{data.expertName}</strong>
            <br />
            {istDateTime(data.startsAt)} IST
          </p>

          {data.intakeDone ? (
            <p className="muted">
              Your intake form is in. Your expert will read it before the call.
            </p>
          ) : (
            <>
              <p>
                One thing left — the short intake form. It is what lets your expert arrive having
                already looked at your holdings.
              </p>
              <a className="b b-fill" href={data.intakePath}>
                Fill the intake form
              </a>
            </>
          )}

          {data.meetingUrl ? (
            <p className="muted spaced">
              Join link: <a href={data.meetingUrl}>{data.meetingUrl}</a>
            </p>
          ) : null}

          {/*
            An account of what was covered, in the expert's words. Framed as
            discussion rather than advice, in line with the terms and with how
            the expert was asked to write it.
          */}
          {data.expertNote ? (
            <div className="notice spaced">
              <span className="notice-label">{data.expertName.split(" ")[0]} noted</span>
              <p>{data.expertNote}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/*
        A no-show is its own status, so it needs its own page. Without this
        branch the booking rendered as a bare logo on a blank page — the worst
        possible answer to "what happened to my session?".
      */}
      {data?.status === "no_show" ? (
        <div className="panel">
          <h1>This session was marked as missed.</h1>
          <p>
            Your expert held the time and you were not able to join. If that is wrong, or something
            got in the way, reply to your confirmation email and we will look at it.
          </p>
          <a className="b b-fill" href="/#experts">
            Book another session
          </a>
        </div>
      ) : null}

      {data?.status === "refunded" ? (
        <div className="panel">
          <h1>That slot went, and your money is coming back.</h1>
          <p>
            Your payment arrived just after someone else took the slot. We have refunded it in full
            — it should reach your account within 5-7 working days.
          </p>
          <a className="b b-fill" href="/#experts">
            Pick another slot
          </a>
        </div>
      ) : null}

      {data?.status === "expired" || data?.status === "cancelled" ? (
        <div className="panel">
          <h1>This booking is no longer active.</h1>
          <p className="muted">
            The hold on the slot lapsed before payment completed. Nothing was charged.
          </p>
          <a className="b b-fill" href="/#experts">
            Book again
          </a>
        </div>
      ) : null}
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
