import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";
import { NETWORKS } from "@/lib/config";
import { ESCROW, type EscrowNet } from "@/lib/escrow";

/**
 * Where escrow files live: listing details, previews and delivered files. A private Vercel Blob store in
 * production (every read goes through our own routes, which decide who may see what). In local
 * development without a store, a git-ignored folder on disk.
 */
// A store connected in Vercel sets BLOB_STORE_ID and signs in with Vercel's OIDC token; a read-write
// token works too.
const BLOB = Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
const DISK = !BLOB && process.env.NODE_ENV !== "production";
const ROOT = path.join(process.cwd(), ".escrow-store");

export const storeReady = () => BLOB || DISK;

/** Paths are built by our own code only; this keeps a mistake from ever leaving the store's folder. */
const SAFE_PATH = /^(public|deliveries)\/[a-z0-9/._-]+$/i;
function checkPath(p: string) {
  if (!SAFE_PATH.test(p) || p.includes("..")) throw new Error(`Bad store path: ${p}`);
}

export async function putObject(p: string, bytes: Uint8Array, contentType: string) {
  checkPath(p);
  if (BLOB) {
    await put(p, Buffer.from(bytes), { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  if (!DISK) throw new Error("File storage isn't set up.");
  const file = path.join(ROOT, p);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  await writeFile(`${file}.type`, contentType);
}

export async function getObject(p: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  checkPath(p);
  if (BLOB) {
    const r = await get(p, { access: "private" });
    if (!r || r.statusCode !== 200) return null;
    return { bytes: new Uint8Array(await new Response(r.stream).arrayBuffer()), contentType: r.blob.contentType };
  }
  if (!DISK) return null;
  const file = path.join(ROOT, p);
  try {
    const [bytes, contentType] = await Promise.all([readFile(file), readFile(`${file}.type`, "utf8")]);
    return { bytes: new Uint8Array(bytes), contentType };
  } catch {
    return null;
  }
}

/** A deal's private folder: its delivered files, dispute notes and which emails went out. */
export const deliveryFolder = (net: EscrowNet, dealId: bigint) => `deliveries/${NETWORKS[net].chain.id}/${ESCROW[net]!.toLowerCase()}/${dealId}`;

/** Where a deal's delivered file is kept, by its hash. Only /api/escrow/file reads it back. */
export const deliveryPath = (net: EscrowNet, dealId: bigint, hash: string) => `${deliveryFolder(net, dealId)}/${hash.slice(2).toLowerCase()}`;
