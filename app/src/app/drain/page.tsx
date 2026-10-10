import { getAddress, isAddress } from "viem";
import DrainSim from "@/components/DrainSim";
import SiteHeader from "@/components/SiteHeader";

export const metadata = { title: "Stash · Drain test" };

// /drain?vault=0x… runs the simulation on that vault; without it, on the current network's demo vault
// (testnet or mainnet is chosen in the browser, so DrainSim picks the demo vault there).
// No login needed: the simulation only reads public chain state.
export default async function DrainPage({ searchParams }: PageProps<"/drain">) {
  const { vault } = await searchParams;
  const target = typeof vault === "string" && isAddress(vault) ? getAddress(vault) : undefined;
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <SiteHeader />
      <DrainSim vault={target} />
    </main>
  );
}
