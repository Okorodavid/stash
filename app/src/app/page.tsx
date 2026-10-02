import LazyApp from "@/components/LazyApp";

// Server-rendered shell: visible immediately on slow connections. The wallet/login code
// (Privy, viem) loads after first paint inside <LazyApp />.
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">Stash</span>
        <span className="text-xs text-muted">Testnet beta · unaudited</span>
      </header>
      <LazyApp />
    </main>
  );
}
