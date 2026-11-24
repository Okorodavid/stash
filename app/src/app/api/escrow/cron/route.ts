import { ESCROW, ESCROW_NETS, readDeals, State } from "@/lib/escrow";
import { alertDeal } from "@/lib/server/escrowAlerts";
import { storeReady } from "@/lib/server/escrowStore";

const OPEN = new Set([State.Funded, State.Delivered, State.Disputed]);

/**
 * Daily backstop (vercel.json crons): sends any alert the app didn't, e.g. when someone used the
 * contract directly. Vercel calls it with `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  if (!storeReady()) return Response.json({ error: "Escrow storage isn't set up yet." }, { status: 503 });
  const report: Record<string, number> = {};
  for (const net of ESCROW_NETS.filter((n) => ESCROW[n])) {
    for (const d of (await readDeals(net)).filter((x) => OPEN.has(x.state))) {
      const result = await alertDeal(net, d).catch(() => "failed");
      report[result] = (report[result] ?? 0) + 1;
    }
  }
  return Response.json(report);
}
