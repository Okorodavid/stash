import NewListing from "@/components/escrow/NewListing";
import { OnChain } from "@/components/escrow/EscrowShell";
import { parseSlug } from "@/lib/escrow";

export const metadata = { title: "Stash · List something" };

export default async function NewListingPage({ searchParams }: { searchParams: Promise<{ chain?: string }> }) {
  const { chain } = await searchParams;
  return (
    <OnChain slug={parseSlug(chain)}>
      <NewListing />
    </OnChain>
  );
}
