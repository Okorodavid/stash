import { bytesToString } from "viem";
import { checkNote, State, type Notes } from "@/lib/escrow";
import { dealFrom, roleIn } from "@/lib/server/escrowAccess";
import { deliveryFolder, getObject, putObject, storeReady } from "@/lib/server/escrowStore";
import { requestAddresses, serverConfigured } from "@/lib/server/privy";

const notePath = (folder: string, side: "buyer" | "seller") => `${folder}/note-${side}.json`;

async function readNote(folder: string, side: "buyer" | "seller") {
  const found = await getObject(notePath(folder, side));
  if (!found) return undefined;
  try {
    return JSON.parse(bytesToString(found.bytes)) as { text: string; at: number };
  } catch {
    return undefined;
  }
}

/** Both sides' notes on a disputed deal, for the buyer, the seller and Stash's arbiter. */
export async function GET(request: Request) {
  if (!serverConfigured() || !storeReady()) return Response.json({ error: "Escrow storage isn't set up yet." }, { status: 503 });
  const addresses = await requestAddresses(request);
  if (!addresses?.length) return Response.json({ error: "Sign in first." }, { status: 401 });
  const q = new URL(request.url).searchParams;
  const found = await dealFrom(q.get("net"), q.get("deal"));
  if (!found) return Response.json({ error: "No such deal." }, { status: 404 });
  if (!(await roleIn(found.net, found.deal, addresses))) return Response.json({ error: "Not your deal." }, { status: 403 });
  const folder = deliveryFolder(found.net, found.deal.id);
  const notes: Notes = { buyer: await readNote(folder, "buyer"), seller: await readNote(folder, "seller") };
  return Response.json(notes, { headers: { "Cache-Control": "private, no-store" } });
}

/** The buyer or seller writes (or rewrites) their side of a dispute. */
export async function POST(request: Request) {
  if (!serverConfigured() || !storeReady()) return Response.json({ error: "Escrow storage isn't set up yet." }, { status: 503 });
  const addresses = await requestAddresses(request);
  if (!addresses?.length) return Response.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { net?: unknown; deal?: unknown; text?: unknown } | null;
  const found = await dealFrom(body?.net, body?.deal);
  if (!found) return Response.json({ error: "No such deal." }, { status: 404 });
  const role = await roleIn(found.net, found.deal, addresses);
  if (role !== "buyer" && role !== "seller") return Response.json({ error: "Only the buyer and seller can write here." }, { status: 403 });
  if (found.deal.state !== State.Disputed) return Response.json({ error: "This deal isn't in dispute." }, { status: 409 });
  const text = checkNote(body?.text);
  if (!text) return Response.json({ error: "Write up to 1,000 characters." }, { status: 422 });
  const note = { text, at: Math.floor(Date.now() / 1000) };
  await putObject(notePath(deliveryFolder(found.net, found.deal.id), role), new TextEncoder().encode(JSON.stringify(note)), "application/json");
  return Response.json(note);
}
