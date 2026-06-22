'use client';

import { useState, useEffect } from 'react';
import type { Holding, PriceData } from '@/types';
import type { TreemapItem } from '@/components/Treemap';
import TreemapClient from '@/components/Treemap';

interface Props {
  holdings: Holding[];
  usdKrw: number;
}

async function withConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) { const i = next++; await fn(items[i]); }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function fmt(n: number) { return (isFinite(n) ? n : 0).toLocaleString('ko-KR'); }

function computeItems(
  holdings: Holding[],
  priceMap: Record<string, PriceData | null | undefined>,
  usdKrw: number
): TreemapItem[] {
  type Agg = { name: string; valueKRW: number; costBasisKRW: number; sector: string | null };
  const byTicker = new Map<string, Agg>();

  for (const h of holdings) {
    const raw = priceMap[h.id];
    const price = raw ?? null;
    const priceOk = price !== null && isFinite(price.currentPrice) && price.currentPrice > 0;
    const currentPrice = priceOk ? price.currentPrice : h.avgPrice;
    const fxRate = h.currency === 'USD' ? (usdKrw || 1) : 1;
    const valueKRW = h.quantity * currentPrice * fxRate;
    const costBasisKRW = h.quantity * h.avgPrice * fxRate;

    const prev = byTicker.get(h.ticker);
    if (prev) {
      prev.valueKRW += valueKRW;
      prev.costBasisKRW += costBasisKRW;
    } else {
      byTicker.set(h.ticker, { name: h.name, valueKRW, costBasisKRW, sector: h.sector ?? null });
    }
  }

  const totalValueKRW = Array.from(byTicker.values()).reduce((s, v) => s + v.valueKRW, 0);

  return Array.from(byTicker.entries())
    .map(([ticker, v]) => ({
      ticker,
      name: v.name,
      valueKRW: v.valueKRW,
      gainLossRate: v.costBasisKRW > 0 ? ((v.valueKRW - v.costBasisKRW) / v.costBasisKRW) * 100 : 0,
      weight: totalValueKRW > 0 ? (v.valueKRW / totalValueKRW) * 100 : 0,
      sector: v.sector,
    }))
    .sort((a, b) => b.weight - a.weight);
}

export default function TreemapLoader({ holdings, usdKrw }: Props) {
  const [priceMap, setPriceMap] = useState<Record<string, PriceData | null | undefined>>({});
  const [pricesLoading, setPricesLoading] = useState(holdings.length > 0);

  useEffect(() => {
    if (holdings.length === 0) { setPricesLoading(false); return; }

    let cancelled = false;

    async function fetchAllPrices() {
      await withConcurrency(holdings, 10, async (holding) => {
        if (cancelled) return;
        try {
          if (holding.market !== 'US') {
            const params = new URLSearchParams({ ticker: holding.ticker, market: holding.market });
            const res = await fetch(`/api/kis/price?${params}`);
            const data = res.ok ? await res.json() : null;
            if (!cancelled) setPriceMap((prev) => ({ ...prev, [holding.id]: data?.currentPrice ? data : null }));
            return;
          }

          const exchanges = holding.exchange
            ? [holding.exchange, ...['NAS', 'NYS', 'AMS'].filter((e) => e !== holding.exchange)]
            : ['NAS', 'NYS', 'AMS'];

          let found = false;
          for (const exchange of exchanges) {
            if (cancelled) break;
            try {
              const params = new URLSearchParams({ ticker: holding.ticker, market: 'US', exchange });
              const res = await fetch(`/api/kis/price?${params}`);
              if (res.ok) {
                const data = await res.json();
                if (data?.currentPrice) {
                  if (!cancelled) setPriceMap((prev) => ({ ...prev, [holding.id]: data }));
                  found = true;
                  break;
                }
              }
            } catch { continue; }
          }
          if (!found && !cancelled) setPriceMap((prev) => ({ ...prev, [holding.id]: null }));
        } catch {
          if (!cancelled) setPriceMap((prev) => ({ ...prev, [holding.id]: null }));
        }
      });
      if (!cancelled) setPricesLoading(false);
    }

    fetchAllPrices();
    return () => { cancelled = true; };
  }, [holdings]);

  if (holdings.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl p-12 text-center text-gray-600 text-sm">
        보유 종목이 없습니다.
      </div>
    );
  }

  const items = computeItems(holdings, priceMap, usdKrw);
  const showCards = items.length < 3;

  return (
    <>
      {/* 트리맵 (3개 이상) */}
      {!showCards && (
        <div className="bg-gray-900 rounded-xl p-4 mb-6 relative">
          {pricesLoading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-gray-900/70 z-10">
              <span className="text-xs text-gray-500 animate-pulse">시세 조회 중...</span>
            </div>
          )}
          <TreemapClient items={items} height={480} />
        </div>
      )}

      {/* 카드형 뷰 */}
      <div
        className={`grid gap-4 ${
          items.length === 1
            ? 'grid-cols-1'
            : items.length === 2
            ? 'grid-cols-2'
            : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
        }`}
      >
        {items.map((item) => {
          const holdingsForTicker = holdings.filter((h) => h.ticker === item.ticker);
          const anyLoading = holdingsForTicker.some((h) => priceMap[h.id] === undefined && pricesLoading);
          return (
            <div
              key={item.ticker}
              className="bg-gray-900 rounded-xl p-4 border border-gray-800 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-white text-sm">{item.name}</p>
                  <p className="text-xs text-gray-500">
                    {item.ticker}
                    {item.sector && <span className="ml-1.5 text-gray-600">· {item.sector}</span>}
                  </p>
                </div>
                {anyLoading ? (
                  <span className="inline-block w-14 h-5 bg-gray-700/60 rounded animate-pulse" />
                ) : (
                  <span className={`text-sm font-bold private-value ${item.gainLossRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {item.gainLossRate >= 0 ? '+' : ''}{item.gainLossRate.toFixed(2)}%
                  </span>
                )}
              </div>
              {anyLoading ? (
                <span className="inline-block w-28 h-5 bg-gray-700/60 rounded animate-pulse" />
              ) : (
                <p className="text-base text-white font-medium private-value">
                  ₩{fmt(Math.round(item.valueKRW))}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                비중 {anyLoading ? '―' : `${item.weight.toFixed(1)}%`}
              </p>
              <div className="mt-2 h-1 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${item.gainLossRate >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(item.weight, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* 색상 범례 */}
      <div className="mt-6 flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-500">수익률 색상:</span>
        {[
          { label: '+20%↑', color: 'bg-[#22543d]' },
          { label: '+10%', color: 'bg-[#38a169]' },
          { label: '+2%', color: 'bg-[#48bb78]' },
          { label: '±0%', color: 'bg-gray-500' },
          { label: '-2%', color: 'bg-[#fc8181]' },
          { label: '-10%', color: 'bg-[#e53e3e]' },
          { label: '-20%↓', color: 'bg-[#9b2c2c]' },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded-sm ${l.color}`} />
            <span className="text-xs text-gray-400">{l.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}
