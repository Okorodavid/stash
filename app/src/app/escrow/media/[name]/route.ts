import { getObject } from "@/lib/server/escrowStore";

const NAME = /^[0-9a-f]{64}\.(json|png|jpg|webp|gif)$/;

/**
 * Public listing files (details and previews), named by their own hash so they never change: cached
 * for a year. Outside /api so a board full of previews doesn't count against the API rate limit.
 * Delivered files are never served here.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!NAME.test(name)) return new Response("Not found", { status: 404 });
  const found = await getObject(`public/${name}`);
  if (!found) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(found.bytes), {
    headers: {
      "Content-Type": found.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // Opened directly, the file can't run anything.
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
