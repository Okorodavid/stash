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
      <h1 className="text-3xl font-semibold leading-tight">
        {guardian ? "You're a guardian of someone's savings." : "USDC savings a stolen key can't drain."}
      </h1>
      <button
        onClick={onStart}
        disabled={loading}
        className={btn}
      >
        {loading ? "Loading…" : guardian ? "Sign in with your guardian account" : "Get started"}
      </button>
      {!guardian && process.env.NEXT_PUBLIC_DEMO_VAULT && (
        <a href="/drain" className="flex min-h-11 items-center justify-center text-sm text-muted underline underline-offset-2 hover:text-foreground">
          Simulate a stolen key
        </a>
      )}
    </section>
  );
}
