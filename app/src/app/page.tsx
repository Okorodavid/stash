import LazyApp from "@/components/LazyApp";
import SiteHeader from "@/components/SiteHeader";

// Server-rendered shell: visible immediately on slow connections. The wallet/login code
// (Privy, viem) loads after first paint inside <LazyApp />.
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-6 lg:max-w-6xl lg:px-8">
      <SiteHeader />
      <LazyApp />
    </main>
  );
}
