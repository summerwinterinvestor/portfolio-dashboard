import type { Holding, PriceData, FxRate } from "@/types";
import { prisma } from "@/lib/prisma";
import RebalanceTable from "@/components/RebalanceTable";

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

export default async function RebalancePage() {
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
  type TickerEntry = {
    name: string;
    market: string;
    currency: "KRW" | "USD";
    currentValueKRW: number;
    currentPrice: number;
    priceOk: boolean;
    targetWeight: number | null;
  };
  const byTicker = new Map<string, TickerEntry>();

  holdings.forEach((holding, i) => {
    const { price } = fetchResults[i];
    const priceOk = price !== null && isFinite(price.currentPrice) && price.currentPrice > 0;
    const currentPrice = priceOk ? price!.currentPrice : holding.avgPrice;
    const fxRate = holding.currency === "USD" ? (usdKrw || 1) : 1;
    const currentValueKRW = holding.quantity * currentPrice * fxRate;

    const prev = byTicker.get(holding.ticker);
    if (prev) {
      prev.currentValueKRW += currentValueKRW;
      if (!prev.priceOk && priceOk) {
        prev.currentPrice = currentPrice;
        prev.priceOk = true;
      }
      if (prev.targetWeight === null && holding.targetWeight !== null) {
        prev.targetWeight = holding.targetWeight;
      }
    } else {
      byTicker.set(holding.ticker, {
        name: holding.name,
        market: holding.market,
        currency: holding.currency,
        currentValueKRW,
        currentPrice,
        priceOk,
        targetWeight: holding.targetWeight ?? null,
      });
    }
  });

  const totalValueKRW = Array.from(byTicker.values()).reduce((s, v) => s + v.currentValueKRW, 0);

  const rows = Array.from(byTicker.entries()).map(([ticker, v]) => {
    const currentWeight = totalValueKRW > 0 ? (v.currentValueKRW / totalValueKRW) * 100 : 0;
    const gap = v.targetWeight !== null ? currentWeight - v.targetWeight : null;
    return {
      ticker,
      name: v.name,
      market: v.market,
      currency: v.currency,
      currentValueKRW: v.currentValueKRW,
      currentWeight,
      targetWeight: v.targetWeight,
      gap,
      priceOk: v.priceOk,
      currentPrice: v.currentPrice,
    };
  });

  const totalTargetWeight = rows.reduce((s, r) => s + (r.targetWeight ?? 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-white">리밸런싱</h1>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>총 평가금액: ₩{fmt(Math.round(totalValueKRW))}</span>
          {fxData && <span>환율: {fmt(fxData.usdKrw)}원</span>}
        </div>
      </div>

      {totalTargetWeight > 0 && Math.abs(totalTargetWeight - 100) > 0.5 && (
        <div className="mb-4 px-4 py-3 bg-yellow-900/30 border border-yellow-800/50 rounded-lg text-xs text-yellow-500">
          목표 비중 합계가 {totalTargetWeight.toFixed(1)}%입니다. 100%가 되도록 조정해주세요.
        </div>
      )}

      <RebalanceTable rows={rows} totalValueKRW={totalValueKRW} />
    </div>
  );
}
