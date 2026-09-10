/**
 * Ops counts across most of the database to draw its overview tiles, and the
 * bookings and members pages read whole tables.
 *
 * The chrome comes from app/ops/layout.tsx, which sits above this boundary
 * and has already rendered, so this is only the page body. The signed-out
 * redirect is in middleware.ts and is unaffected.
 */
export default function LoadingOps() {
  return (
    <div role="status" aria-busy="true">
      <span className="sk-say">Loading…</span>

      <span className="sk sk-h1" aria-hidden="true" style={{ maxWidth: 200 }} />

      <div className="ops-tiles" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ops-tile">
            <span className="sk" style={{ width: 46, height: 26, marginBottom: 10 }} />
            <span className="sk" style={{ width: 96, height: 10 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
