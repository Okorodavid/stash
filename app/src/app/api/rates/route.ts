import { fetchRates } from "@/lib/rateSources";

/**
 * Live yearly rates for each pot, fetched on the server so ad blockers or flaky connections to Morpho
 * and Reflect don't leave the app without them. Vercel's edge caches the answer for 10 minutes.
 */
export async function GET() {
  const rates = await fetchRates();
  return Response.json(rates, {
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
  });
}
