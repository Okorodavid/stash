import { notFound } from "next/navigation";
import { getAddress, isAddress } from "viem";
import ShopPage from "@/components/escrow/ShopPage";
import { OnChain } from "@/components/escrow/EscrowShell";
import { parseSlug } from "@/lib/escrow";

type Props = { params: Promise<{ address: string }>; searchParams: Promise<{ chain?: string }> };

export default async function Shop({ params, searchParams }: Props) {
  const [{ address }, { chain }] = await Promise.all([params, searchParams]);
  if (!isAddress(address)) notFound();
  return (
    <OnChain slug={parseSlug(chain)}>
      <ShopPage seller={getAddress(address)} />
    </OnChain>
  );
}
