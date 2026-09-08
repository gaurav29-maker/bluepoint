export default function NoDatabase() {
  return (
    <div className="ops-empty">
      <h2>No database connected</h2>
      <p>
        The console is running, but <code>DATABASE_URL</code> is not set on this deployment, so
        there is nothing to show. Add it, redeploy, then run the schema push and seed.
      </p>
    </div>
  );
}
