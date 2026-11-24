import { keccak256 } from "viem";
import { checkMeta, MAX_PREVIEW_BYTES, metaBytes, sniff } from "@/lib/escrow";
import { putObject, storeReady } from "@/lib/server/escrowStore";
import { requestAddresses, serverConfigured } from "@/lib/server/privy";

const IMAGES = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

/**
 * Saves a listing's public parts before the seller lists it on-chain: its text (`meta`, checked here,
 * links refused) or its preview image (`image`). Both are stored under their own hash, which is what the
 * contract records, so nobody can change them afterwards.
 */
export async function POST(request: Request) {
  if (!serverConfigured() || !storeReady()) return Response.json({ error: "Escrow storage isn't set up yet." }, { status: 503 });
  const addresses = await requestAddresses(request);
  if (!addresses?.length) return Response.json({ error: "Sign in first." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Nothing was sent." }, { status: 400 });

  const image = form.get("image");
  if (image instanceof File) {
    if (image.size > MAX_PREVIEW_BYTES) return Response.json({ error: "Keep the preview under 2 MB." }, { status: 413 });
    const bytes = new Uint8Array(await image.arrayBuffer());
    const kind = sniff(image.name, bytes);
    if (!kind || !IMAGES.has(kind.ext)) return Response.json({ error: "The preview must be a PNG, JPG, WebP or GIF." }, { status: 415 });
    const ext = kind.ext === "jpeg" ? "jpg" : kind.ext;
    const name = `${keccak256(bytes).slice(2)}.${ext}`;
    await putObject(`public/${name}`, bytes, kind.type);
    return Response.json({ name });
  }

  const raw = form.get("meta");
  if (typeof raw !== "string" || raw.length > 10_000) return Response.json({ error: "Missing listing details." }, { status: 400 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Missing listing details." }, { status: 400 });
  }
  const checked = checkMeta(parsed);
  if ("error" in checked) return Response.json({ error: checked.error }, { status: 422 });
  const bytes = metaBytes(checked.meta);
  const hash = keccak256(bytes);
  await putObject(`public/${hash.slice(2)}.json`, bytes, "application/json");
  return Response.json({ hash });
}
