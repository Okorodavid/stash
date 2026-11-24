import Disputes from "@/components/escrow/Disputes";
import { OnChain } from "@/components/escrow/EscrowShell";
import { parseSlug } from "@/lib/escrow";

export const metadata = { title: "Stash · Disputes", robots: { index: false } };

export default async function DisputesPage({ searchParams }: { searchParams: Promise<{ chain?: string }> }) {
  const { chain } = await searchParams;
  return (
    <OnChain slug={parseSlug(chain)}>
      <Disputes />
    </OnChain>
  );
}
