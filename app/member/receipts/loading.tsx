/*
 * A note on where these live.
 *
 * There is deliberately no loading.tsx at app/member. `loading.tsx` opens a
 * Suspense boundary, so the response starts streaming before the page runs —
 * and a `redirect()` after the first flush cannot set a status, it becomes a
 * 200 with the redirect carried in the stream. /member is the one console
 * route middleware.ts deliberately does not guard, because it may carry a
 * one-time sign-in link, so its redirect lives in the page and would be the
 * one broken. Measured, not assumed: with a skeleton at app/member, GET
 * /member signed out returned 200 instead of 307.
 *
 * These two routes are guarded by middleware, which runs before anything
 * streams, so they keep their redirect and get a skeleton.
 */
export default function LoadingReceipts() {
  return (
    <div className="wrap bp-page member" role="status" aria-busy="true">
      <span className="sk-say">Loading your receipts…</span>

      <div className="os-bar">
        <a href="/" className="logo os-mark">
          blue<span>point</span> <em>os</em>
        </a>
        <span className="os-nav">
          <a href="/member">Console</a>
          <a href="/member/profile">Your details</a>
        </span>
      </div>

      <div aria-hidden="true" style={{ display: "grid", gap: 18, marginTop: 26 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="bp-panel">
            <span className="sk" style={{ width: 120, height: 10, marginBottom: 16 }} />
            <div className="sk-lines">
              <span className="sk" />
              <span className="sk" style={{ maxWidth: "72%" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
