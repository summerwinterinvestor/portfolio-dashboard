import type { Holding, PriceData, FxRate } from "@/types";
import { prisma } from "@/lib/prisma";
import type { TreemapItem } from "@/components/Treemap";
import TreemapClient from "@/components/Treemap";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

async function fetchHoldings(): Promise<Holding[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/holdings?active=true`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

type PriceFetchResult = { price: PriceData | null; foundExchange: string | null };

async function withConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchPrice(holding: Holding): Promise<PriceFetchResult> {
  if (holding.market !== "US") {
    try {
      const params = new URLSearchParams({ ticker: holding.ticker, market: holding.market });
      const res = await fetch(`${BASE_URL}/api/kis/price?${params}`, { cache: "no-store" });
      if (!res.ok) return { price: null, foundExchange: null };
      const data = await res.json();
      return { price: data.currentPrice ? data : null, foundExchange: null };
    } catch {
      return { price: null, foundExchange: null };
    }
  }

  const saved = holding.exchange;
  const exchanges = saved
    ? [saved, ...["NAS", "NYS", "AMS"].filter((e) => e !== saved)]
    : ["NAS", "NYS", "AMS"];

  for (const exchange of exchanges) {
    try {
      const params = new URLSearchParams({ ticker: holding.ticker, market: holding.market, exchange });
      const res = await fetch(`${BASE_URL}/api/kis/price?${params}`, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.currentPrice) return { price: data, foundExchange: exchange };
    } catch {
      continue;
    }
  }
  return { price: null, foundExchange: null };
}

async function fetchFx(): Promise<FxRate | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/kis/fx`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

export default async function TreemapPage() {
  const [holdings, fxData] = await Promise.all([fetchHoldings(), fetchFx()]);
  const usdKrw = fxData?.usdKrw ?? 0;

  const fetchResults = await withConcurrency(holdings, 5, fetchPrice);

  // 새로 발견된 거래소 코드 저장
  const exchangeUpdates = holdings.flatMap((h, i) => {
    const { foundExchange } = fetchResults[i];
    if (h.market === "US" && foundExchange && foundExchange !== h.exchange) {
      return [prisma.holding.update({ where: { id: h.id }, data: { exchange: foundExchange } })];
    }
    return [];
  });
  if (exchangeUpdates.length > 0) await Promise.all(exchangeUpdates);

  // 티커별로 합산 (여러 계좌에 같은 종목이 있을 경우 병합)
  type TickerAgg = { name: string; valueKRW: number; costBasisKRW: number; sector: string | null };
  const byTicker = new Map<string, TickerAgg>();

  holdings.forEach((holding, i) => {
    const price = fetchResults[i].price;
    const priceOk = price !== null && isFinite(price.currentPrice) && price.currentPrice > 0;
    const currentPrice = priceOk ? price!.currentPrice : holding.avgPrice;
    const fxRate = holding.currency === "USD" ? (usdKrw || 1) : 1;
    const valueKRW = holding.quantity * currentPrice * fxRate;
    const costBasisKRW = holding.quantity * holding.avgPrice * fxRate;

    const prev = byTicker.get(holding.ticker);
    if (prev) {
      prev.valueKRW += valueKRW;
      prev.costBasisKRW += costBasisKRW;
    } else {
      byTicker.set(holding.ticker, { name: holding.name, valueKRW, costBasisKRW, sector: holding.sector ?? null });
    }
  });

  const totalValueKRW = Array.from(byTicker.values()).reduce((s, v) => s + v.valueKRW, 0);

  const items: TreemapItem[] = Array.from(byTicker.entries()).map(([ticker, v]) => ({
    ticker,
    name: v.name,
    valueKRW: v.valueKRW,
    gainLossRate: v.costBasisKRW > 0 ? ((v.valueKRW - v.costBasisKRW) / v.costBasisKRW) * 100 : 0,
    weight: totalValueKRW > 0 ? (v.valueKRW / totalValueKRW) * 100 : 0,
    sector: v.sector,
  }));

  const hasData = items.length > 0;
  const showCards = items.length < 3;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-white">트리맵</h1>
        {fxData && (
          <span className="text-xs text-gray-500">
            환율 {fmt(fxData.usdKrw)}원
          </span>
        )}
      </div>

      {!hasData ? (
        <div className="bg-gray-900 rounded-xl p-12 text-center text-gray-600 text-sm">
          보유 종목이 없습니다.
        </div>
      ) : (
        <>
          {/* 트리맵 (3개 이상) */}
          {!showCards && (
            <div className="bg-gray-900 rounded-xl p-4 mb-6">
              <TreemapClient items={items} height={480} />
            </div>
          )}

          {/* 카드형 뷰 (항상 병행, 또는 3개 미만이면 단독) */}
          <div
            className={`grid gap-4 ${
              items.length === 1
                ? "grid-cols-1"
                : items.length === 2
                ? "grid-cols-2"
                : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
            }`}
          >
            {items.map((item) => (
              <div
                key={item.ticker}
                className="bg-gray-900 rounded-xl p-4 border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-white text-sm">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.ticker}
                      {item.sector && (
                        <span className="ml-1.5 text-gray-600">· {item.sector}</span>
                      )}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-bold private-value ${
                      item.gainLossRate >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {item.gainLossRate >= 0 ? "+" : ""}
                    {item.gainLossRate.toFixed(2)}%
                  </span>
                </div>
                <p className="text-base text-white font-medium private-value">
                  ₩{fmt(Math.round(item.valueKRW))}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  비중 {item.weight.toFixed(1)}%
                </p>
                {/* 미니 비중 바 */}
                <div className="mt-2 h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      item.gainLossRate >= 0 ? "bg-green-500" : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(item.weight, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* 색상 범례 */}
          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <span className="text-xs text-gray-500">수익률 색상:</span>
            {[
              { label: "+20%↑", color: "bg-[#22543d]" },
              { label: "+10%", color: "bg-[#38a169]" },
              { label: "+2%", color: "bg-[#48bb78]" },
              { label: "±0%", color: "bg-gray-500" },
              { label: "-2%", color: "bg-[#fc8181]" },
              { label: "-10%", color: "bg-[#e53e3e]" },
              { label: "-20%↓", color: "bg-[#9b2c2c]" },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1">
                <div className={`w-3 h-3 rounded-sm ${l.color}`} />
                <span className="text-xs text-gray-400">{l.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
