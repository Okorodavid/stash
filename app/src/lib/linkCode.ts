// Signed, expiring code that links a Telegram chat to a wallet address.
// Created by the app (for the signed-in user's own address) and verified by the worker's bot.
// Layout: 20-byte address | 4-byte expiry (unix seconds) | 12-byte HMAC-SHA256 prefix -> 48 base64url chars,
// within Telegram's 64-char /start parameter limit.
import { createHmac, timingSafeEqual } from "node:crypto";

const MAC_BYTES = 12;
export const LINK_CODE_TTL_SECONDS = 15 * 60;

function mac(secret: string, payload: Buffer) {
  return createHmac("sha256", secret).update(payload).digest().subarray(0, MAC_BYTES);
}

export function createLinkCode(secret: string, address: string, now = Math.floor(Date.now() / 1000)): string {
  const addr = Buffer.from(address.toLowerCase().replace(/^0x/, ""), "hex");
  if (addr.length !== 20) throw new Error("Invalid address");
  const exp = Buffer.alloc(4);
  exp.writeUInt32BE(now + LINK_CODE_TTL_SECONDS);
  const payload = Buffer.concat([addr, exp]);
  return Buffer.concat([payload, mac(secret, payload)]).toString("base64url");
}

/** Returns the linked address (lowercase 0x…) if the code is authentic and unexpired, else null. */
export function verifyLinkCode(secret: string, code: string, now = Math.floor(Date.now() / 1000)): string | null {
  let raw: Buffer;
  try {
    raw = Buffer.from(code, "base64url");
  } catch {
    return null;
  }
  if (raw.length !== 24 + MAC_BYTES) return null;
  const payload = raw.subarray(0, 24);
  const given = raw.subarray(24);
  if (!timingSafeEqual(given, mac(secret, payload))) return null;
  if (payload.readUInt32BE(20) < now) return null;
  return `0x${payload.subarray(0, 20).toString("hex")}`;
}
