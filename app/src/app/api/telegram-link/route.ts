import { createLinkCode } from "@/lib/linkCode";
import { embeddedEthereumAddress, serverConfigured, verifyAccessToken } from "@/lib/server/privy";

const LINK_SECRET = process.env.LINK_SECRET ?? "";
const BOT = process.env.TELEGRAM_BOT_USERNAME ?? "";

/**
 * Returns a one-time Telegram link that subscribes the signed-in user's own wallet address
 * (as vault owner or guardian) to Stash alerts. The address comes from Privy, never the client.
 */
export async function POST(request: Request) {
  if (!serverConfigured() || !LINK_SECRET || !BOT) {
    return Response.json({ error: "Telegram alerts aren't configured on this server yet" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const address = await embeddedEthereumAddress(userId);
  if (!address) return Response.json({ error: "No Stash wallet on this account" }, { status: 404 });
  return Response.json({ url: `https://t.me/${BOT}?start=${createLinkCode(LINK_SECRET, address)}` });
}
