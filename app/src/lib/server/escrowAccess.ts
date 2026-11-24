import "server-only";
import { ESCROW, isEscrowNet, readArbiter, readDeal, type Deal, type EscrowNet } from "@/lib/escrow";

/** Reads `net` and `deal` from a request (query or form) and the deal itself. */
export async function dealFrom(net: unknown, dealRaw: unknown): Promise<{ net: EscrowNet; deal: Deal } | null> {
  if (!isEscrowNet(net) || !ESCROW[net] || typeof dealRaw !== "string" || !/^\d{1,18}$/.test(dealRaw)) return null;
  const deal = await readDeal(net, BigInt(dealRaw));
  return deal ? { net, deal } : null;
}

/** Which side of a deal the signed-in person is: buyer, seller, Stash's arbiter, or none. */
export async function roleIn(net: EscrowNet, deal: Deal, addresses: string[]) {
  if (addresses.includes(deal.buyer.toLowerCase())) return "buyer" as const;
  if (addresses.includes(deal.seller.toLowerCase())) return "seller" as const;
  if (addresses.includes((await readArbiter(net)).toLowerCase())) return "arbiter" as const;
  return null;
}
