/**
 * The expert console loads the expert, their upcoming sessions, the ones
 * still waiting to be closed out, and the ones already done.
 *
 * Safe here where it is not at app/member: every /expert path is guarded by
 * middleware.ts, which runs before anything streams, so a signed-out visitor
 * still gets a 307 to /expert/login rather than a skeleton.
 */
export default function LoadingExpertConsole() {
  return (
    <div className="wrap bp-page member" role="status" aria-busy="true">
      <span className="sk-say">Loading your console…</span>

      <div className="os-bar">
        <a href="/" className="logo os-mark">
          blue<span>point</span> <em>expert</em>
        </a>
        <span className="os-nav">
          <a href="/expert/availability">Hours</a>
          <a href="/expert/profile">Profile</a>
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
