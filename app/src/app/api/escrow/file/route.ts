import { bytesToString } from "viem";
import { dealView, State, ZERO_HASH } from "@/lib/escrow";
import { dealFrom, roleIn } from "@/lib/server/escrowAccess";
import { deliveryPath, getObject, storeReady } from "@/lib/server/escrowStore";
import { requestAddresses, serverConfigured } from "@/lib/server/privy";

/**
 * Hands the delivered file to the deal's buyer (or its seller, or Stash's arbiter during a dispute), and to nobody else. Serves only the file
 * whose hash the seller recorded on-chain, always as a download, never shown in the page.
 */
export async function GET(request: Request) {
  if (!serverConfigured() || !storeReady()) return Response.json({ error: "Escrow storage isn't set up yet." }, { status: 503 });
  const addresses = await requestAddresses(request);
  if (!addresses?.length) return Response.json({ error: "Sign in first." }, { status: 401 });

  const q = new URL(request.url).searchParams;
  const found = await dealFrom(q.get("net"), q.get("deal"));
  if (!found) return Response.json({ error: "No such deal." }, { status: 404 });
  const { net, deal } = found;

  // Stash's arbiter may open the file of a disputed deal, to rule on it.
  const role = await roleIn(net, deal, addresses);
  const me = role === "buyer" ? deal.buyer : role === "seller" ? deal.seller : undefined;
  const allowed =
    dealView(deal, me, Math.floor(Date.now() / 1000)).canDownload || (role === "arbiter" && deal.state === State.Disputed && deal.fileHash !== ZERO_HASH);
  if (!allowed) return Response.json({ error: "This file isn't available to you." }, { status: 403 });

  const at = deliveryPath(net, deal.id, deal.fileHash);
  const [file, info] = await Promise.all([getObject(at), getObject(`${at}.json`)]);
  if (!file) return Response.json({ error: "The file is missing. Open a dispute if you're the buyer." }, { status: 404 });
  let name = "delivery";
  try {
    name = (JSON.parse(bytesToString(info?.bytes ?? new Uint8Array())) as { name?: string }).name || name;
  } catch {
    // keep the default name
  }
  return new Response(Buffer.from(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
