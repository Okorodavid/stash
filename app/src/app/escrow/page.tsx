import Board from "@/components/escrow/Board";
import { OnChain } from "@/components/escrow/EscrowShell";
import { parseSlug } from "@/lib/escrow";

type Search = { searchParams: Promise<{ chain?: string }> };

export default async function EscrowBoardPage({ searchParams }: Search) {
  const { chain } = await searchParams;
  return (
    <OnChain slug={parseSlug(chain)}>
      <Board />
    </OnChain>
  );
}
