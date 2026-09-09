"use client";

import { use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function IntakeForm({ id }: { id: string }) {
  const token = useSearchParams().get("t") ?? "";

  const [rows, setRows] = useState<{ label: string; pct: string }[]>([
    { label: "", pct: "" },
    { label: "", pct: "" },
    { label: "", pct: "" },
  ]);
  const [holdingsSummary, setHoldings] = useState("");
  const [goals, setGoals] = useState("");
  const [experienceYears, setExperience] = useState("");
  const [riskComfort, setRisk] = useState("");
  const [tradesFno, setTradesFno] = useState(false);
  const [questions, setQuestions] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const totalPct = rows.reduce((n, r) => n + (Number(r.pct) || 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${id}/intake`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          holdings: rows
            .map((r) => ({ label: r.label.trim(), pct: Number(r.pct) }))
            .filter((r) => r.label !== "" && Number.isFinite(r.pct)),
          holdingsSummary,
          goals,
          experienceYears: experienceYears === "" ? undefined : Number(experienceYears),
          riskComfort: riskComfort === "" ? undefined : riskComfort,
          tradesFno,
          questions,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save that");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="bp-panel">
        <h1>Thank you — that is everything.</h1>
        <p className="bp-muted">
          Your expert will read this before the call. You can close this page.
        </p>
      </div>
    );
  }

  return (
    <form className="bp-panel" onSubmit={submit}>
      <h1>Before your call</h1>
      <p className="bp-lead">
        Five minutes here saves fifteen on the call. The more concrete you are, the more useful the
        session.
      </p>

      <div className="bp-warn">
        Never share a demat or broker login — not here, not with your expert, not with anyone. There
        is no field on this form that asks for one.
      </div>

      {/*
        Rows first, prose second. The rows are what make one session
        comparable to the last; the prose is what a percentage cannot say.
      */}
      <div className="bp-field">
        <span>What are you holding?</span>
        <p className="bp-fineprint intake-hint">
          Rough percentages are fine — they only need to be close enough to talk about.
        </p>
        <div className="intake-rows">
          {rows.map((r, i) => (
            <div className="intake-row" key={i}>
              <input
                aria-label={`Holding ${i + 1}`}
                placeholder="e.g. two IT largecaps"
                value={r.label}
                onChange={(e) =>
                  setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
              />
              <div className="intake-pct">
                <input
                  aria-label={`Percentage for holding ${i + 1}`}
                  type="number"
                  min={0}
                  max={100}
                  placeholder="0"
                  value={r.pct}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))
                  }
                />
                <span>%</span>
              </div>
              <button
                type="button"
                className="intake-drop"
                aria-label={`Remove holding ${i + 1}`}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                disabled={rows.length <= 1}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="intake-tools">
          <button
            type="button"
            className="ops-btn"
            onClick={() => setRows([...rows, { label: "", pct: "" }])}
            disabled={rows.length >= 20}
          >
            Add a line
          </button>
          <span className={`intake-total${totalPct > 100 ? " over" : ""}`}>
            {totalPct}% accounted for
          </span>
        </div>
      </div>

      <label className="bp-field">
        <span>Anything the percentages do not say</span>
        <textarea
          rows={4}
          required
          value={holdingsSummary}
          onChange={(e) => setHoldings(e.target.value)}
          placeholder="How you got here, what you keep changing your mind about, anything you would tell a friend about this portfolio."
        />
      </label>

      <label className="bp-field">
        <span>What do you want out of the call?</span>
        <textarea
          rows={3}
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          placeholder="For example: am I too concentrated? Should I be worried about my F&O position sizing?"
        />
      </label>

      <div className="bp-row">
        <label className="bp-field">
          <span>
            Years investing <em>optional</em>
          </span>
          <input
            type="number"
            min={0}
            max={80}
            value={experienceYears}
            onChange={(e) => setExperience(e.target.value)}
          />
        </label>

        <label className="bp-field">
          <span>
            Comfort with risk <em>optional</em>
          </span>
          <select value={riskComfort} onChange={(e) => setRisk(e.target.value)}>
            <option value="">Prefer not to say</option>
            <option value="low">Low — I want to sleep at night</option>
            <option value="medium">Medium</option>
            <option value="high">High — drawdowns do not bother me</option>
          </select>
        </label>
      </div>

      <label className="bp-check">
        <input
          type="checkbox"
          checked={tradesFno}
          onChange={(e) => setTradesFno(e.target.checked)}
        />
        <span>I trade futures and options</span>
      </label>

      <label className="bp-field">
        <span>
          Anything specific you want to ask? <em>optional</em>
        </span>
        <textarea rows={3} value={questions} onChange={(e) => setQuestions(e.target.value)} />
      </label>

      {error ? <p className="bp-error">{error}</p> : null}

      <button className="btn-primary bp-full" disabled={busy || holdingsSummary.trim() === ""}>
        {busy ? "Saving…" : "Send to my expert"}
      </button>

      <p className="bp-fineprint">
        This goes only to the expert you booked, and is deleted 90 days after the call.
      </p>
    </form>
  );
}

export default function IntakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="wrap bp-page">
      <div className="logo bp-page-logo">
        blue<span>point</span>
      </div>
      <Suspense fallback={<p className="bp-muted">Loading…</p>}>
        <IntakeForm id={id} />
      </Suspense>
    </div>
  );
}
