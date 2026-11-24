import "server-only";
import { formatUnits } from "viem";
import { DISPUTE_TIMEOUT, escrowToken, isTestNet, slugOf, State, type Deal, type EscrowNet } from "@/lib/escrow";
import { emailForWallet, emailReady, sendEmail } from "./email";
import { deliveryFolder, getObject, putObject } from "./escrowStore";

const SITE = process.env.SITE_URL ?? "https://stash.urelimitless.com";

const dateText = (unix: number) =>
  new Date(unix * 1000).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";

function dealLink(net: EscrowNet, id: bigint) {
  const url = new URL(`/escrow/deal/${id}`, SITE);
  if (slugOf(net) !== "base") url.searchParams.set("chain", slugOf(net));
  url.searchParams.set("network", isTestNet(net) ? "testnet" : "mainnet");
  return url.toString();
}

type Alert = { event: string; to: "buyer" | "seller"; subject: string; text: string };

/** The one alert a deal's current state calls for, if any. */
function alertFor(net: EscrowNet, d: Deal): Alert | null {
  const token = escrowToken(net);
  const price = `${Number(formatUnits(d.price, token.decimals)).toFixed(2)} ${token.symbol}`;
  const link = dealLink(net, d.id);
  const test = isTestNet(net) ? " (test money)" : "";
  if (d.state === State.Funded) {
    return {
      event: "sold",
      to: "seller",
      subject: `You made a sale: ${price}${test}`,
      text: `A buyer paid ${price} into escrow for deal ${d.id}.\n\nDeliver the file by ${dateText(d.deliverBy)}, or the buyer can take their money back.\n\n${link}`,
    };
  }
  if (d.state === State.Delivered) {
    const ends = dateText(d.deliveredAt + d.reviewWindow);
    return {
      event: "delivered",
      to: "buyer",
      subject: `Your file is ready. Check it by ${ends}`,
      text: `The seller delivered the file for deal ${d.id} (${price}${test}).\n\nDownload it and check it. If something is wrong, open a dispute before ${ends}. If you say nothing by then, the seller is paid.\n\n${link}`,
    };
  }
  if (d.state === State.Disputed) {
    return {
      event: "disputed",
      to: "seller",
      subject: `The buyer opened a dispute on deal ${d.id}`,
      text: `The buyer says something is wrong with deal ${d.id} (${price}${test}). Stash will look at it and decide by ${dateText(d.disputedAt + DISPUTE_TIMEOUT)}.\n\nAdd your side of it here:\n\n${link}`,
    };
  }
  return null;
}

/**
 * Sends the alert for a deal's current state, once. Safe to call any number of times: from the app right
 * after a transaction, and from the daily sweep. Returns what happened, for logs.
 */
export async function alertDeal(net: EscrowNet, d: Deal): Promise<string> {
  if (!emailReady()) return "email not set up";
  const alert = alertFor(net, d);
  if (!alert) return "nothing to send";
  const marker = `${deliveryFolder(net, d.id)}/sent-${alert.event}`;
  if (await getObject(marker)) return "already sent";
  const email = await emailForWallet(alert.to === "buyer" ? d.buyer : d.seller);
  if (email) await sendEmail(email, alert.subject, alert.text, marker);
  await putObject(marker, new TextEncoder().encode(email ? "sent" : "no email"), "text/plain");
  return email ? "sent" : "no email on file";
}
