import { notFound } from "next/navigation";
import ListingPage from "@/components/escrow/ListingPage";
import { OnChain } from "@/components/escrow/EscrowShell";
import { parseSlug } from "@/lib/escrow";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ chain?: string }> };

export default async function Listing({ params, searchParams }: Props) {
  const [{ id }, { chain }] = await Promise.all([params, searchParams]);
  if (!/^\d{1,18}$/.test(id)) notFound();
  return (
    <OnChain slug={parseSlug(chain)}>
      <ListingPage id={BigInt(id)} />
    </OnChain>
  );
}
