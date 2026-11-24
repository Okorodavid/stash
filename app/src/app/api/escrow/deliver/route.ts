import { keccak256 } from "viem";
import { ESCROW, isEscrowNet, MAX_FILE_BYTES, readDeal, safeName, sniff, State } from "@/lib/escrow";
import { deliveryPath, putObject, storeReady } from "@/lib/server/escrowStore";
import { requestAddresses, serverConfigured } from "@/lib/server/privy";

/**
 * The seller uploads the final file for a paid deal. Returns its hash, which the seller then records
 * on-chain with `deliver`; the download route serves only the file matching that recorded hash.
 */
export async function POST(request: Request) {
  if (!serverConfigured() || !storeReady()) return Response.json({ error: "Escrow storage isn't set up yet." }, { status: 503 });
  const addresses = await requestAddresses(request);
  if (!addresses?.length) return Response.json({ error: "Sign in first." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const net = form?.get("net");
  const dealRaw = form?.get("deal");
  const file = form?.get("file");
  if (!isEscrowNet(net) || !ESCROW[net] || typeof dealRaw !== "string" || !/^\d{1,18}$/.test(dealRaw) || !(file instanceof File)) {
    return Response.json({ error: "Nothing to deliver." }, { status: 400 });
  }
  const deal = await readDeal(net, BigInt(dealRaw));
  if (!deal) return Response.json({ error: "No such deal." }, { status: 404 });
  if (!addresses.includes(deal.seller.toLowerCase())) return Response.json({ error: "Only the seller can deliver." }, { status: 403 });
  if (deal.state !== State.Funded) return Response.json({ error: "This deal isn't waiting for a file." }, { status: 409 });

  if (file.size > MAX_FILE_BYTES) return Response.json({ error: "Keep the file under 4 MB. Zip it if it's bigger." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(file.name, bytes);
  if (!kind) return Response.json({ error: "That file type isn't allowed, or the file doesn't match its name." }, { status: 415 });

  const hash = keccak256(bytes);
  const at = deliveryPath(net, deal.id, hash);
  await putObject(at, bytes, kind.type);
  await putObject(`${at}.json`, new TextEncoder().encode(JSON.stringify({ name: safeName(file.name) })), "application/json");
  return Response.json({ hash });
}
