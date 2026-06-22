/**
 * GET /api/kis/price?ticker=000660&market=KR
 * GET /api/kis/price?ticker=AAPL&market=US&exchange=NAS
 */

import type { NextRequest } from "next/server";
import { getCachedDomesticPrice, getCachedOverseasPrice } from "@/lib/kis/price-cache";
import type { ExchangeCode } from "@/lib/kis/overseas-price";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const ticker = searchParams.get("ticker");
  const market = searchParams.get("market");
  const exchange = (searchParams.get("exchange") ?? "NAS") as ExchangeCode;

  if (!ticker || !market) {
    return Response.json(
      { error: "ticker and market query parameters are required" },
      { status: 400 }
    );
  }

  try {
    if (market === "KR") {
      const price = await getCachedDomesticPrice(ticker);
      return Response.json(price);
    } else if (market === "US") {
      const price = await getCachedOverseasPrice(ticker, exchange);
      return Response.json(price);
    } else {
      return Response.json(
        { error: `Unsupported market: ${market}. Use KR or US.` },
        { status: 400 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/kis/price] Error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
