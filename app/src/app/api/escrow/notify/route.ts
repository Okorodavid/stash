import { alertDeal } from "@/lib/server/escrowAlerts";
import { dealFrom } from "@/lib/server/escrowAccess";
import { storeReady } from "@/lib/server/escrowStore";

/**
 * The app calls this right after a sale, a delivery or a dispute. It needs no sign-in: it only ever
 * emails a deal's own buyer or seller about what the chain says happened, and each alert goes once.
 */
export async function POST(request: Request) {
  if (!storeReady()) return Response.json({ error: "Escrow storage isn't set up yet." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { net?: unknown; deal?: unknown } | null;
  const found = await dealFrom(body?.net, body?.deal);
  if (!found) return Response.json({ error: "No such deal." }, { status: 404 });
  try {
    return Response.json({ result: await alertDeal(found.net, found.deal) });
  } catch (e) {
    console.error("escrow alert failed", e);
    return Response.json({ error: "Couldn't send the alert." }, { status: 502 });
  }
}
