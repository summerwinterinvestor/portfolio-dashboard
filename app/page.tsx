import type { Holding, Account, PriceData, FxRate, Asset } from "@/types";
import NetWorthSummary from "@/components/NetWorthSummary";
import HoldingManager from "@/components/HoldingManager";
import DashboardTable from "@/components/DashboardTable";
import { prisma } from "@/lib/prisma";

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

// N개씩만 동시 실행, 끝나는 대로 다음 항목 시작
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

  // 저장된 거래소 코드를 먼저, 나머지를 뒤에
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

async function fetchAssets(): Promise<Asset[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/assets`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function fetchAccounts(): Promise<Account[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/accounts`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export default async function DashboardPage() {
  const [holdings, fxData, assets, accounts] = await Promise.all([
    fetchHoldings(),
    fetchFx(),
    fetchAssets(),
    fetchAccounts(),
  ]);

  const usdKrw = fxData?.usdKrw ?? 0;

  // 현재가 조회 (최대 5개 동시)
  const fetchResults = await withConcurrency(holdings, 5, fetchPrice);

  // 새로 발견된 거래소 코드를 DB에 저장 (US 종목 한정)
  const exchangeUpdates = holdings.flatMap((h, i) => {
    const { foundExchange } = fetchResults[i];
    if (h.market === "US" && foundExchange && foundExchange !== h.exchange) {
      return [prisma.holding.update({ where: { id: h.id }, data: { exchange: foundExchange } })];
    }
    return [];
  });
  if (exchangeUpdates.length > 0) await Promise.all(exchangeUpdates);

  const priceResults = fetchResults.map((r) => r.price);

  // 종목별 계산
  type Row = {
    holding: Holding;
    price: PriceData | null;
    currentValueKRW: number;
    costBasisKRW: number;
    gainLossRate: number;
    priceOk: boolean;
  };

  const rows: Row[] = holdings.map((holding, i) => {
    const price = priceResults[i];
    const priceOk = price !== null && isFinite(price.currentPrice) && price.currentPrice > 0;

    const currentPrice = priceOk
      ? price!.currentPrice
      : holding.avgPrice;

    const fxRate = holding.currency === "USD" ? (usdKrw || 1) : 1;
    const currentValueKRW = holding.quantity * currentPrice * fxRate;
    const costBasisKRW = holding.quantity * holding.avgPrice * fxRate;
    const gainLossRate =
      costBasisKRW > 0
        ? ((currentValueKRW - costBasisKRW) / costBasisKRW) * 100
        : 0;

    return { holding, price, currentValueKRW, costBasisKRW, gainLossRate, priceOk };
  });

  const totalValueKRW = rows.reduce((s, r) => s + r.currentValueKRW, 0);
  const totalCostKRW = rows.reduce((s, r) => s + r.costBasisKRW, 0);
  const totalGainLossRate =
    totalCostKRW > 0
      ? ((totalValueKRW - totalCostKRW) / totalCostKRW) * 100
      : 0;

  const dailyGainKRW = rows.reduce((sum, row) => {
    if (!row.priceOk || !row.price || !isFinite(row.price.change)) return sum;
    const fxRate = row.holding.currency === "USD" ? (usdKrw || 1) : 1;
    return sum + row.price.change * row.holding.quantity * fxRate;
  }, 0);
  const prevTotalKRW = totalValueKRW - dailyGainKRW;
  const dailyGainRate = prevTotalKRW > 0 ? (dailyGainKRW / prevTotalKRW) * 100 : 0;

  return (
    <div>
      <NetWorthSummary
        stockValueKRW={totalValueKRW}
        assets={assets}
        usdKrw={usdKrw}
      />

      {/* 요약 카드 2×2 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">주식 총 평가금액</p>
          <p className="text-xl font-bold text-white">
            <span className="private-value">{fmt(Math.round(totalValueKRW))}원</span>
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">총 수익률</p>
          <p className={`text-xl font-bold ${totalGainLossRate >= 0 ? "text-green-400" : "text-red-400"}`}>
            <span className="private-value">{fmtPct(totalGainLossRate)}</span>
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">일간 수익금</p>
          <p className={`text-xl font-bold ${dailyGainKRW >= 0 ? "text-green-400" : "text-red-400"}`}>
            <span className="private-value">{dailyGainKRW >= 0 ? "+" : "-"}{fmt(Math.round(Math.abs(dailyGainKRW)))}원</span>
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">일간 수익률</p>
          <p className={`text-xl font-bold ${dailyGainRate >= 0 ? "text-green-400" : "text-red-400"}`}>
            <span className="private-value">{fmtPct(dailyGainRate)}</span>
          </p>
        </div>
      </div>

      {/* 종목 추가/수정 */}
      <HoldingManager accounts={accounts} />

      <DashboardTable rows={rows} totalValueKRW={totalValueKRW} usdKrw={usdKrw} accounts={accounts} />
    </div>
  );
}
