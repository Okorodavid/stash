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
    <section className="mx-auto max-w-md space-y-5">
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
          <h1 className="text-3xl font-semibold leading-tight">USDC savings on Arc that a stolen key or seed phrase can&apos;t drain.</h1>
          <ul className="space-y-2 text-muted">
            <li>• Small amounts move instantly, up to your daily limit.</li>
            <li>• Big withdrawals wait 24 hours or longer (you choose), and your guardians can stop them.</li>
            <li>• Earn on your USDC through Morpho, and lock savings toward a goal.</li>
            <li>• USDC is both your savings and your gas: no other token needed.</li>
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
      {!guardian && process.env.NEXT_PUBLIC_DEMO_VAULT && (
        <a href="/drain" className="block text-center text-sm text-muted underline">
          Watch a thief try to drain a vault
        </a>
      )}
    </section>
  );
}
