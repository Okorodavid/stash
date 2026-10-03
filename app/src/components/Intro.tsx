export default function Intro({
  loading,
  onStart,
  guardian,
}: {
  loading?: boolean;
  onStart?: () => void;
  guardian?: boolean;
}) {
  return (
    <section className="space-y-5">
      {guardian ? (
        <>
          <h1 className="text-3xl font-semibold leading-tight">Someone trusts you to guard their savings.</h1>
          <ul className="space-y-2 text-muted">
            <li>• You can stop a withdrawal they didn&apos;t make, or freeze their vault.</li>
            <li>• You can never move or take their money.</li>
            <li>• Sign in with the account they added as a guardian.</li>
          </ul>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-semibold leading-tight">Save in dollars. A stolen password can&apos;t drain it.</h1>
          <ul className="space-y-2 text-muted">
            <li>• Small amounts move instantly, up to your daily limit.</li>
            <li>• Big withdrawals wait 24 hours, and your guardians can stop them.</li>
            <li>• Lock savings toward a goal and earn on them.</li>
          </ul>
        </>
      )}
      <button
        onClick={onStart}
        disabled={loading}
        className="w-full rounded-xl bg-accent px-4 py-3 font-semibold text-accent-fg disabled:opacity-60"
      >
        {loading ? "Loading…" : guardian ? "Sign in as guardian" : "Get started"}
      </button>
    </section>
  );
}
