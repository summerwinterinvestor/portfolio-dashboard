/**
 * GET /api/kis/fx
 * 원/달러 환율 조회
 */

import { getUsdKrwRate } from "@/lib/kis/fx";

export async function GET() {
  try {
    const fxRate = await getUsdKrwRate();
    return Response.json(fxRate);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/kis/fx] Error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
