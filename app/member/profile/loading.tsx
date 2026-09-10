/* See app/member/receipts/loading.tsx for why there is none at app/member. */
export default function LoadingProfile() {
  return (
    <div className="wrap bp-page member" role="status" aria-busy="true">
      <span className="sk-say">Loading your details…</span>

      <div className="os-bar">
        <a href="/" className="logo os-mark">
          blue<span>point</span> <em>os</em>
        </a>
        <span className="os-nav">
          <a href="/member">Console</a>
          <a href="/member/receipts">Receipts</a>
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
