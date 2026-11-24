import { bytesToString, keccak256, toBytes, type Address, type Hex } from "viem";
import { clientFor } from "./chain";
import { NETWORKS } from "./config";
import { stashEscrowAbi } from "./escrowAbi";

/**
 * Escrow: a buyer's payment held by StashEscrow until the seller delivers and the buyer approves.
 * Shared by the browser and the server routes, so nothing here may touch `window`.
 */

/** Escrow runs on Base (paid in USDC) and BNB Chain (paid in USDT), each with a test network. */
export type EscrowNet = "baseSepolia" | "base" | "bscTestnet" | "bsc";
/** The chain as it appears in links: `?chain=bnb`. Base is the default and needs no parameter. */
export type ChainSlug = "base" | "bnb";
export const CHAIN_SLUGS: ChainSlug[] = ["base", "bnb"];
export const CHAIN_NAME: Record<ChainSlug, string> = { base: "Base", bnb: "BNB Chain" };

const env = (v: string | undefined) => (v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : undefined);

/** Contract addresses from the deploys. Written out in full so Next can inline them. */
export const ESCROW: Record<EscrowNet, Address | undefined> = {
  baseSepolia: env(process.env.NEXT_PUBLIC_ESCROW_BASE_SEPOLIA),
  base: env(process.env.NEXT_PUBLIC_ESCROW_BASE),
  // BNB testnet escrow also needs its test token named (NEXT_PUBLIC_ESCROW_TOKEN_BSC_TESTNET).
  bscTestnet: NETWORKS.bscTestnet.tokens.length ? env(process.env.NEXT_PUBLIC_ESCROW_BSC_TESTNET) : undefined,
  bsc: env(process.env.NEXT_PUBLIC_ESCROW_BSC),
};

export const ESCROW_NETS = Object.keys(ESCROW) as EscrowNet[];
/** Escrow pages and links exist only once a contract is deployed somewhere. */
export const ESCROW_ON = ESCROW_NETS.some((n) => ESCROW[n]);

export const isEscrowNet = (v: unknown): v is EscrowNet => typeof v === "string" && ESCROW_NETS.includes(v as EscrowNet);
export const isTestNet = (n: EscrowNet) => n === "baseSepolia" || n === "bscTestnet";

/** The network for a chain on testnet or mainnet. */
export const netFor = (slug: ChainSlug, mainnet: boolean): EscrowNet =>
  slug === "bnb" ? (mainnet ? "bsc" : "bscTestnet") : mainnet ? "base" : "baseSepolia";
export const slugOf = (n: EscrowNet): ChainSlug => (n === "bsc" || n === "bscTestnet" ? "bnb" : "base");
export const parseSlug = (v: unknown): ChainSlug => (v === "bnb" ? "bnb" : "base");

/** The stablecoin each escrow takes. */
export const escrowToken = (net: EscrowNet) => NETWORKS[net].tokens[0];

export enum State {
  None,
  Funded,
  Delivered,
  Disputed,
  Released,
  Refunded,
}

export type Listing = {
  id: bigint;
  seller: Address;
  token: Address;
  price: bigint;
  fee: bigint;
  deliverWindow: number;
  reviewWindow: number;
  active: boolean;
  meta: Hex;
};

export type Deal = {
  id: bigint;
  buyer: Address;
  seller: Address;
  token: Address;
  price: bigint;
  fee: bigint;
  deliverBy: number;
  deliveredAt: number;
  disputedAt: number;
  reviewWindow: number;
  state: State;
  listingId: bigint;
  fileHash: Hex;
};

/** A disputed deal nobody rules on goes back to the buyer after this long (fixed in the contract). */
export const DISPUTE_TIMEOUT = 30 * 86_400;

const ZERO_HASH = `0x${"0".repeat(64)}` as Hex;

function read(net: EscrowNet, functionName: string, args: readonly unknown[] = []) {
  const address = ESCROW[net];
  if (!address) throw new Error("Escrow isn't on this network yet.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return clientFor(net).readContract({ address, abi: stashEscrowAbi, functionName, args } as any) as Promise<any>;
}

export async function readListing(net: EscrowNet, id: bigint): Promise<Listing | null> {
  const r = await read(net, "listings", [id]);
  if (r[0] === "0x0000000000000000000000000000000000000000") return null;
  return {
    id,
    seller: r[0],
    token: r[1],
    price: r[2],
    fee: r[3],
    deliverWindow: Number(r[4]),
    reviewWindow: Number(r[5]),
    active: r[6],
    meta: r[7],
  };
}

export async function readDeal(net: EscrowNet, id: bigint): Promise<Deal | null> {
  const r = await read(net, "deals", [id]);
  if (Number(r[9]) === State.None) return null;
  return {
    id,
    buyer: r[0],
    seller: r[1],
    token: r[2],
    price: r[3],
    fee: r[4],
    deliverBy: Number(r[5]),
    deliveredAt: Number(r[6]),
    disputedAt: Number(r[7]),
    reviewWindow: Number(r[8]),
    state: Number(r[9]),
    listingId: r[10],
    fileHash: r[11],
  };
}

/** Newest first. The beta reads every id (batched into a few RPC calls); an indexer replaces this at scale. */
const MAX_READ = 300;
async function readAll<T>(net: EscrowNet, counter: string, one: (net: EscrowNet, id: bigint) => Promise<T | null>) {
  const count = (await read(net, counter)) as bigint;
  const ids: bigint[] = [];
  for (let id = count; id >= 1n && ids.length < MAX_READ; id--) ids.push(id);
  return (await Promise.all(ids.map((id) => one(net, id)))).filter((x) => x !== null) as T[];
}
export const readListings = (net: EscrowNet) => readAll(net, "listingCount", readListing);
export const readDeals = (net: EscrowNet) => readAll(net, "dealCount", readDeal);

/** The wallet that rules on disputes (Stash). */
export const readArbiter = async (net: EscrowNet) => (await read(net, "arbiter")) as Address;

/** The fee terms new listings get right now. */
export async function readTerms(net: EscrowNet) {
  const token = escrowToken(net);
  const [feeBps, deliverWindow, reviewWindow, paused, t] = await Promise.all([
    read(net, "feeBps"),
    read(net, "deliverWindow"),
    read(net, "reviewWindow"),
    read(net, "paused"),
    read(net, "tokens", [token.address]),
  ]);
  return {
    feeBps: Number(feeBps),
    deliverWindow: Number(deliverWindow),
    reviewWindow: Number(reviewWindow),
    paused: Boolean(paused),
    allowed: Boolean(t[0]),
    minFee: t[1] as bigint,
    maxPrice: t[2] as bigint,
  };
}

/** Same sum as the contract: the rate, but never under the token's minimum. */
export const feeFor = (price: bigint, feeBps: number, minFee: bigint) => {
  const fee = (price * BigInt(feeBps)) / 10_000n;
  return fee < minFee ? minFee : fee;
};

/** Where a deal stands for the person looking, now. Every exit the contract allows is listed. */
export function dealView(d: Deal, me: Address | undefined, now: number) {
  const isBuyer = !!me && me.toLowerCase() === d.buyer.toLowerCase();
  const isSeller = !!me && me.toLowerCase() === d.seller.toLowerCase();
  const reviewEnds = d.deliveredAt ? d.deliveredAt + d.reviewWindow : 0;
  const disputeEnds = d.disputedAt ? d.disputedAt + DISPUTE_TIMEOUT : 0;
  const funded = d.state === State.Funded;
  const delivered = d.state === State.Delivered;
  const disputed = d.state === State.Disputed;
  return {
    isBuyer,
    isSeller,
    reviewEnds,
    disputeEnds,
    canDeliver: isSeller && funded,
    canRelease: isBuyer && (funded || delivered),
    canDispute: isBuyer && delivered && now < reviewEnds,
    /** Anyone may pay the seller once the buyer stayed silent through the review window. */
    canClaim: delivered && now >= reviewEnds,
    canSellerRefund: isSeller && (funded || delivered || disputed),
    canBuyerRefund: isBuyer && funded && now > d.deliverBy,
    canExpireDispute: disputed && now >= disputeEnds,
    /** The delivered file stays with the buyer and seller unless the money went back to the buyer. */
    canDownload: (isBuyer || isSeller) && d.fileHash !== ZERO_HASH && d.state !== State.Refunded,
  };
}

// ------------------------------------------------------------------ listing details (off-chain)

/** Physical goods come later. */
export const KINDS = ["Design", "API", "Code", "Digital", "Other"] as const;
export type Kind = (typeof KINDS)[number];

export const LIMITS = { shop: 60, title: 100, description: 2000 } as const;

/** The listing text a seller writes. Stored by its hash; the contract keeps the hash (`meta`). */
export type Meta = { v: 1; shop: string; title: string; description: string; kind: Kind; preview?: string };

/**
 * Links are how escrow scams start ("pay me here instead"). Wallet and contract addresses are fine:
 * people sell contracts. Common file names (logo.png, Token.sol, deploy.sh) don't match the domain list.
 */
const LINK =
  /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|xyz|app|dev|co|me|ly|gg|link|site|online|store|shop|info|biz|ng|uk|to|tv|fm|cc|us|ru|cn|top|vip|club|live|pro|finance|money|wallet|exchange|bit\.ly|t\.me|wa\.me)\b|\bt\.me\/|\bwa\.me\/)/i;
/** Tech names that look like domains (sellers of code write these). */
const NOT_LINKS = /\b(asp|ado|vb|dot|entity)\.net\b|\bsocket\.io\b/gi;
export const hasLink = (s: string) => LINK.test(s.replace(NOT_LINKS, " "));

// Control characters other than tab and newline (newlines only in the description).
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/;
/** A stored preview: the image's own hash plus its type. */
export const PREVIEW_NAME = /^[0-9a-f]{64}\.(png|jpg|webp|gif)$/;

/** Checks a listing's text. Run on save (server) and again on display (anyone can call the contract). */
export function checkMeta(x: unknown): { meta: Meta } | { error: string } {
  if (!x || typeof x !== "object") return { error: "Missing listing details." };
  const o = x as Record<string, unknown>;
  const text = (k: keyof typeof LIMITS) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  const shop = text("shop");
  const title = text("title");
  const description = text("description");
  if (!shop || !title) return { error: "Add your shop name and what you're selling." };
  for (const [k, v] of [["shop", shop], ["title", title], ["description", description]] as const) {
    if (v.length > LIMITS[k]) return { error: `Keep the ${k} under ${LIMITS[k]} characters.` };
    if (CONTROL.test(v) || (k !== "description" && /[\r\n]/.test(v))) return { error: `The ${k} has characters that aren't allowed.` };
    if (hasLink(v)) return { error: "Links aren't allowed." };
  }
  const kind = KINDS.find((k) => k === o.kind);
  if (!kind) return { error: "Pick what kind of thing it is." };
  const preview = o.preview === undefined || o.preview === "" ? undefined : o.preview;
  if (preview !== undefined && (typeof preview !== "string" || !PREVIEW_NAME.test(preview))) return { error: "Bad preview image." };
  return { meta: { v: 1, shop, title, description, kind, ...(preview ? { preview } : {}) } };
}

/** The exact bytes stored and hashed: fixed key order, so the same listing always has the same hash. */
export const metaBytes = (m: Meta) =>
  toBytes(JSON.stringify({ v: 1, shop: m.shop, title: m.title, description: m.description, kind: m.kind, preview: m.preview ?? "" }));

/** Public files (listing details, previews) live at /escrow/media/<hash>.<ext>. */
export const mediaUrl = (name: string) => `/escrow/media/${name}`;

/** Fetches a listing's details and refuses them unless they hash to what the contract holds. */
export async function loadMeta(hash: Hex): Promise<Meta | null> {
  try {
    const res = await fetch(mediaUrl(`${hash.slice(2).toLowerCase()}.json`));
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (keccak256(bytes).toLowerCase() !== hash.toLowerCase()) return null;
    const checked = checkMeta(JSON.parse(bytesToString(bytes)));
    return "meta" in checked ? checked.meta : null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------- delivered files

/** Kept small for the beta: uploads and downloads pass through one server function. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

/** File types a seller may deliver, checked from the file's first bytes as well as its name. */
export const FILE_TYPES: Record<string, { type: string; magic?: number[]; text?: boolean }> = {
  png: { type: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
  jpg: { type: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  jpeg: { type: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  webp: { type: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] },
  gif: { type: "image/gif", magic: [0x47, 0x49, 0x46, 0x38] },
  pdf: { type: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  zip: { type: "application/zip", magic: [0x50, 0x4b, 0x03, 0x04] },
  docx: { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: [0x50, 0x4b, 0x03, 0x04] },
  xlsx: { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", magic: [0x50, 0x4b, 0x03, 0x04] },
  pptx: { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", magic: [0x50, 0x4b, 0x03, 0x04] },
  txt: { type: "text/plain", text: true },
  md: { type: "text/plain", text: true },
  csv: { type: "text/plain", text: true },
  json: { type: "text/plain", text: true },
  sol: { type: "text/plain", text: true },
};
export const FILE_ACCEPT = Object.keys(FILE_TYPES).map((e) => `.${e}`).join(",");

/** The type a file really is, or null when its name and first bytes don't agree with an allowed type. */
export function sniff(name: string, bytes: Uint8Array): { ext: string; type: string } | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const spec = ext ? FILE_TYPES[ext] : undefined;
  if (!ext || !spec) return null;
  if (spec.magic) return spec.magic.every((b, i) => bytes[i] === b) ? { ext, type: spec.type } : null;
  // Text: valid UTF-8 with no NUL bytes.
  if (bytes.includes(0)) return null;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  return { ext, type: spec.type };
}

/** What each side says about a disputed deal, for the arbiter. Plain text, shown as text. */
export const NOTE_LIMIT = 1000;
export type Notes = { buyer?: { text: string; at: number }; seller?: { text: string; at: number } };
export function checkNote(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const t = x.trim();
  if (!t || t.length > NOTE_LIMIT || /[\u0000-\u0008\u000B-\u001F\u007F\u202A-\u202E\u2066-\u2069]/.test(t)) return null;
  return t;
}

/** A file name safe to hand back in a download header. */
export const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "file";

export { ZERO_HASH };
