import Link from "next/link";
import { getAddress, isAddress } from "viem";
import DrainSim from "@/components/DrainSim";

export const metadata = { title: "Stash · Drain test" };

// /drain?vault=0x… runs the simulation on that vault; without it, on the demo vault (if configured).
// No login needed: the simulation only reads public chain state.
export default async function DrainPage({ searchParams }: PageProps<"/drain">) {
  const { vault } = await searchParams;
  const target = typeof vault === "string" && isAddress(vault) ? vault : process.env.NEXT_PUBLIC_DEMO_VAULT;
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Stash
        </Link>
        <span className="text-xs text-muted">Testnet beta · unaudited</span>
      </header>
      {target && isAddress(target) ? (
        <DrainSim vault={getAddress(target)} />
      ) : (
        <p className="text-muted">This link is missing a vault address. Open the drain test from your Stash dashboard.</p>
      )}
    </main>
  );
}
