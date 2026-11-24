import { notFound } from "next/navigation";
import DealRoom from "@/components/escrow/DealRoom";
import { OnChain } from "@/components/escrow/EscrowShell";
import { parseSlug } from "@/lib/escrow";

export const metadata = { title: "Stash · Deal" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ chain?: string }> };

export default async function Deal({ params, searchParams }: Props) {
  const [{ id }, { chain }] = await Promise.all([params, searchParams]);
  if (!/^\d{1,18}$/.test(id)) notFound();
  return (
    <OnChain slug={parseSlug(chain)}>
      <DealRoom id={BigInt(id)} />
    </OnChain>
  );
}
