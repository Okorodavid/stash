import LazyApp from "@/components/LazyApp";
import SiteHeader from "@/components/SiteHeader";

export const metadata = { title: "Stash · Swap" };

// Swaps between the user's own wallets on Tempo, Base and Solana. Needs the Privy login for the wallets.
export default function SwapPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <SiteHeader />
      <LazyApp swap />
    </main>
  );
}
