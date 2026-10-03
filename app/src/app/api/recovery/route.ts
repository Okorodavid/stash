import { serverConfigured, updateCustomMetadata, verifyAccessToken } from "@/lib/server/privy";

/** Marks the signed-in user's recovery key as backed up, on their Privy account (all devices). */
export async function POST(request: Request) {
  if (!serverConfigured()) {
    return Response.json({ error: "Server not configured (PRIVY_APP_SECRET missing)" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  await updateCustomMetadata(userId, { recovery_backed_up: true });
  return Response.json({ ok: true });
}
