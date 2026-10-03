import "server-only";
import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const APP_SECRET = process.env.PRIVY_APP_SECRET ?? "";

type Jwk = JsonWebKey & { kid?: string };
let jwksCache: { keys: Jwk[]; at: number } | null = null;

async function signingKeys(): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.at < 60 * 60 * 1000) return jwksCache.keys;
  const res = await fetch(`https://auth.privy.io/api/v1/apps/${APP_ID}/jwks.json`);
  if (!res.ok) throw new Error("Could not load Privy signing keys");
  const { keys } = (await res.json()) as { keys: Jwk[] };
  jwksCache = { keys, at: Date.now() };
  return keys;
}

const b64url = (s: string) => Buffer.from(s, "base64url");

/** Verifies a Privy access token (ES256 JWT) and returns the user's Privy DID, or null. */
export async function verifyAccessToken(token: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  let header: { alg?: string; kid?: string };
  let claims: { iss?: string; aud?: string; sub?: string; exp?: number };
  try {
    header = JSON.parse(b64url(h).toString("utf8"));
    claims = JSON.parse(b64url(p).toString("utf8"));
  } catch {
    return null;
  }
  if (header.alg !== "ES256") return null;
  const jwk = (await signingKeys()).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const ok = verify(
    "sha256",
    Buffer.from(`${h}.${p}`),
    { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" },
    b64url(sig),
  );
  if (!ok) return null;
  if (claims.iss !== "privy.io" || claims.aud !== APP_ID) return null;
  if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
  return claims.sub ?? null;
}

export const serverConfigured = () => Boolean(APP_ID && APP_SECRET);

/** Shallow-merges keys into the user's Privy custom metadata. */
export async function updateCustomMetadata(userId: string, metadata: Record<string, string | number | boolean>) {
  const res = await fetch(`https://api.privy.io/v1/users/${encodeURIComponent(userId)}/custom_metadata`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "privy-app-id": APP_ID,
      Authorization: `Basic ${Buffer.from(`${APP_ID}:${APP_SECRET}`).toString("base64")}`,
    },
    body: JSON.stringify({ custom_metadata: metadata }),
  });
  if (!res.ok) throw new Error(`Privy metadata update failed (${res.status})`);
}
