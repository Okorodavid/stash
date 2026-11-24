import "server-only";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const APP_SECRET = process.env.PRIVY_APP_SECRET ?? "";
const RESEND_KEY = process.env.RESEND_API_KEY ?? "";
/** The sender, on a domain verified in Resend, e.g. "Stash <escrow@urelimitless.com>". */
const FROM = process.env.EMAIL_FROM ?? "";

export const emailReady = () => Boolean(RESEND_KEY && FROM && APP_ID && APP_SECRET);

/** The email on the Privy account that owns this wallet, if they signed up with one. */
export async function emailForWallet(address: string): Promise<string | null> {
  const res = await fetch("https://api.privy.io/v1/users/wallet/address", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "privy-app-id": APP_ID,
      Authorization: `Basic ${Buffer.from(`${APP_ID}:${APP_SECRET}`).toString("base64")}`,
    },
    body: JSON.stringify({ address }),
  });
  if (res.status === 404) return null; // a wallet that never signed in to Stash
  if (!res.ok) throw new Error(`Privy lookup failed (${res.status})`);
  const user = (await res.json()) as { linked_accounts?: { type: string; address?: string; email?: string | null }[] };
  const accounts = user.linked_accounts ?? [];
  const email = accounts.find((a) => a.type === "email")?.address ?? accounts.find((a) => a.type === "google_oauth")?.email;
  return email ?? null;
}

/**
 * Sends one plain email. `key` makes a repeat send within a day a no-op at Resend, so two callers
 * racing on the same alert don't send it twice.
 */
export async function sendEmail(to: string, subject: string, text: string, key: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}`, "Idempotency-Key": key.slice(0, 256) },
    body: JSON.stringify({ from: FROM, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Email failed (${res.status})`);
}
