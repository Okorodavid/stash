import { btn } from "./ui";

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
          <p className="text-muted">Sign in with the account they added as a guardian.</p>
        </>
      ) : (
        <h1 className="text-3xl font-semibold leading-tight">Save and gain interest. A stolen key or seed phrase can&apos;t drain you.</h1>
      )}
      <button
        onClick={onStart}
        disabled={loading}
        className={btn}
      >
        {loading ? "Loading…" : guardian ? "Sign in as guardian" : "Get started"}
      </button>
      {!guardian && process.env.NEXT_PUBLIC_DEMO_VAULT && (
        <a href="/drain" className="flex min-h-11 items-center justify-center text-sm text-muted underline underline-offset-2 hover:text-foreground">
          Watch a thief try to drain a vault
        </a>
      )}
    </section>
  );
}
