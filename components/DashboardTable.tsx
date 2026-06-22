'use client';

import { useState, useEffect, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import type { Holding, PriceData, Account, Asset } from '@/types';
import HoldingForm from './HoldingForm';
import NetWorthSummary from './NetWorthSummary';

export type DashboardRow = {
  holding: Holding;
  price: PriceData | null;
  currentValueKRW: number;
  costBasisKRW: number;
  gainLossRate: number;
  priceOk: boolean;
  priceLoading: boolean;
};

interface Props {
  holdings: Holding[];
  usdKrw: number;
  assets: Asset[];
  accounts: Account[];
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

type ViewMode = '전체' | '시장별' | '계좌별';

function fmt(n: number) { return (isFinite(n) ? n : 0).toLocaleString('ko-KR'); }
function fmtPct(n: number) { return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`; }

function DailyChange({ change, changeRate, currency }: { change: number; changeRate: number; currency: string }) {
  if (!isFinite(changeRate) || changeRate === 0) return null;
  const up = changeRate > 0;
  const color = up ? 'text-green-400' : 'text-red-400';
  const arrow = up ? '▲' : '▼';
  const changeStr = currency === 'USD'
    ? `${up ? '+' : ''}$${Math.abs(change).toFixed(2)}`
    : `${up ? '+' : ''}₩${fmt(Math.round(Math.abs(change)))}`;
  return (
    <span className={`text-xs ${color} private-value`}>
      {arrow} {changeStr} ({up ? '+' : ''}{changeRate.toFixed(2)}%)
    </span>
  );
}

const BROKER_COLORS = [
  '#60a5fa', '#a78bfa', '#34d399', '#fb923c', '#f472b6',
  '#22d3ee', '#facc15', '#f87171', '#a3e635', '#e879f9',
];

function brokerColor(broker: string): string {
  const hash = [...broker].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return BROKER_COLORS[hash % BROKER_COLORS.length];
}

const TH = () => (
  <tr className="text-xs text-gray-500 border-b border-gray-800/50">
    <th className="px-4 py-3 text-left">종목</th>
    <th className="px-4 py-3 text-right">현재가</th>
    <th className="px-4 py-3 text-right">평가금액 (원화)</th>
    <th className="px-4 py-3 text-right">수익률</th>
    <th className="px-4 py-3 text-right">비중</th>
    <th className="px-4 py-3" />
  </tr>
);

function Skeleton({ w = 'w-20' }: { w?: string }) {
  return <span className={`inline-block ${w} h-4 bg-gray-700/60 rounded animate-pulse`} />;
}

export default function DashboardTable({ holdings, usdKrw, assets, accounts }: Props) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('전체');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  // undefined = 아직 조회 전, null = 조회 실패, PriceData = 성공
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

  const toggleExpand = (ticker: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(ticker) ? next.delete(ticker) : next.add(ticker);
      return next;
    });

  const handleDelete = async (holding: Holding) => {
    if (!confirm(`"${holding.name}"을(를) 삭제할까요?`)) return;
    try {
      const res = await fetch(`/api/holdings/${holding.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 오류');
    }
  };

  // ── 행 계산 ──────────────────────────────────────────────────
  const rows: DashboardRow[] = holdings.map((holding) => {
    const rawPrice = priceMap[holding.id];
    const price = rawPrice ?? null;
    const priceLoading = rawPrice === undefined && pricesLoading;
    const priceOk = price !== null && isFinite(price.currentPrice) && price.currentPrice > 0;
    const currentPrice = priceOk ? price.currentPrice : holding.avgPrice;
    const fxRate = holding.currency === 'USD' ? (usdKrw || 1) : 1;
    const currentValueKRW = holding.quantity * currentPrice * fxRate;
    const costBasisKRW = holding.quantity * holding.avgPrice * fxRate;
    const gainLossRate =
      costBasisKRW > 0 ? ((currentValueKRW - costBasisKRW) / costBasisKRW) * 100 : 0;
    return { holding, price, currentValueKRW, costBasisKRW, gainLossRate, priceOk, priceLoading };
  });

  const totalValueKRW = rows.reduce((s, r) => s + r.currentValueKRW, 0);
  const totalCostKRW = rows.reduce((s, r) => s + r.costBasisKRW, 0);
  const totalGainLossRate =
    totalCostKRW > 0 ? ((totalValueKRW - totalCostKRW) / totalCostKRW) * 100 : 0;
  const dailyGainKRW = rows.reduce((sum, row) => {
    if (!row.priceOk || !row.price || !isFinite(row.price.change)) return sum;
    const fxRate = row.holding.currency === 'USD' ? (usdKrw || 1) : 1;
    return sum + row.price.change * row.holding.quantity * fxRate;
  }, 0);
  const prevTotalKRW = totalValueKRW - dailyGainKRW;
  const dailyGainRate = prevTotalKRW > 0 ? (dailyGainKRW / prevTotalKRW) * 100 : 0;
  const anyPriceFail = !pricesLoading && rows.some((r) => !r.priceOk);

  // ── 전체 뷰: 티커별 합산 ──────────────────────────────────────
  type TickerGroup = {
    ticker: string; name: string; market: string; currency: string;
    currentPrice: number; priceOk: boolean; priceLoading: boolean;
    change: number; changeRate: number;
    totalValue: number; totalCost: number; gainLossRate: number;
    rows: DashboardRow[];
  };

  const tickerMap = new Map<string, TickerGroup>();
  for (const row of rows) {
    const { holding } = row;
    if (!tickerMap.has(holding.ticker)) {
      tickerMap.set(holding.ticker, {
        ticker: holding.ticker, name: holding.name,
        market: holding.market, currency: holding.currency,
        currentPrice: row.priceOk ? row.price!.currentPrice : holding.avgPrice,
        priceOk: row.priceOk,
        priceLoading: row.priceLoading,
        change: row.priceOk ? (row.price!.change ?? 0) : 0,
        changeRate: row.priceOk ? (row.price!.changeRate ?? 0) : 0,
        totalValue: 0, totalCost: 0, gainLossRate: 0, rows: [],
      });
    }
    const g = tickerMap.get(holding.ticker)!;
    g.rows.push(row);
    g.totalValue += row.currentValueKRW;
    g.totalCost += row.costBasisKRW;
    if (!g.priceOk && row.priceOk) {
      g.currentPrice = row.price!.currentPrice;
      g.priceOk = true;
      g.priceLoading = false;
    }
    if (g.priceLoading && !row.priceLoading) g.priceLoading = false;
  }
  for (const g of tickerMap.values()) {
    g.gainLossRate = g.totalCost > 0 ? ((g.totalValue - g.totalCost) / g.totalCost) * 100 : 0;
  }
  const tickerGroups = Array.from(tickerMap.values()).sort((a, b) => b.totalValue - a.totalValue);

  // ── 시장별 뷰 ────────────────────────────────────────────────
  type MarketGroup = { label: string; market: string; rows: DashboardRow[]; subtotal: number; cost: number };
  const marketMap = new Map<string, MarketGroup>([
    ['KR', { label: '국내주식', market: 'KR', rows: [], subtotal: 0, cost: 0 }],
    ['US', { label: '해외주식', market: 'US', rows: [], subtotal: 0, cost: 0 }],
  ]);
  for (const row of rows) {
    const key = row.holding.market === 'KR' ? 'KR' : 'US';
    const g = marketMap.get(key)!;
    g.rows.push(row);
    g.subtotal += row.currentValueKRW;
    g.cost += row.costBasisKRW;
  }
  const marketGroups = Array.from(marketMap.values())
    .filter((g) => g.rows.length > 0)
    .sort((a, b) => b.subtotal - a.subtotal);

  // ── 계좌별 뷰 ────────────────────────────────────────────────
  type AccountGroup = { label: string; broker: string; rows: DashboardRow[]; subtotal: number; cost: number };
  const acctMap = new Map<string, AccountGroup>();
  for (const row of rows) {
    const broker = row.holding.account?.broker ?? '';
    const key = row.holding.account ? `${broker} — ${row.holding.account.name}` : '계좌 미지정';
    if (!acctMap.has(key)) acctMap.set(key, { label: key, broker, rows: [], subtotal: 0, cost: 0 });
    const g = acctMap.get(key)!;
    g.rows.push(row);
    g.subtotal += row.currentValueKRW;
    g.cost += row.costBasisKRW;
  }
  const acctGroups = Array.from(acctMap.values()).sort((a, b) => b.subtotal - a.subtotal);

  // ── 개별 행 버튼 ─────────────────────────────────────────────
  const ActionButtons = ({ holding }: { holding: Holding }) => (
    <div className="flex justify-end gap-3">
      <button
        onClick={(e) => { e.stopPropagation(); setEditingHolding(holding); }}
        className="text-xs text-gray-400 hover:text-blue-400 transition-colors"
      >수정</button>
      <button
        onClick={(e) => { e.stopPropagation(); handleDelete(holding); }}
        className="text-xs text-gray-400 hover:text-red-400 transition-colors"
      >삭제</button>
    </div>
  );

  return (
    <>
      {/* 순자산 요약 */}
      <NetWorthSummary
        stockValueKRW={totalValueKRW}
        assets={assets}
        usdKrw={usdKrw}
      />

      {/* 요약 카드 2×2 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card bg-gray-900 p-5">
          <p className="label mb-2">주식 총 평가금액</p>
          <p className="text-2xl font-bold text-white">
            {pricesLoading
              ? <Skeleton w="w-32" />
              : <span className="private-value value-in" style={{ animationDelay: '0ms' }}>{fmt(Math.round(totalValueKRW))}원</span>
            }
          </p>
        </div>
        <div className="card bg-gray-900 p-5">
          <p className="label mb-2">총 수익률</p>
          <p className={`text-2xl font-bold ${totalGainLossRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {pricesLoading
              ? <Skeleton w="w-20" />
              : <span className="private-value value-in" style={{ animationDelay: '60ms' }}>{fmtPct(totalGainLossRate)}</span>
            }
          </p>
        </div>
        <div className="card bg-gray-900 p-5">
          <p className="label mb-2">일간 수익금</p>
          <p className={`text-2xl font-bold ${dailyGainKRW >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {pricesLoading
              ? <Skeleton w="w-28" />
              : <span className="private-value value-in" style={{ animationDelay: '120ms' }}>{dailyGainKRW >= 0 ? '+' : '-'}{fmt(Math.round(Math.abs(dailyGainKRW)))}원</span>
            }
          </p>
        </div>
        <div className="card bg-gray-900 p-5">
          <p className="label mb-2">일간 수익률</p>
          <p className={`text-2xl font-bold ${dailyGainRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {pricesLoading
              ? <Skeleton w="w-20" />
              : <span className="private-value value-in" style={{ animationDelay: '180ms' }}>{fmtPct(dailyGainRate)}</span>
            }
          </p>
        </div>
      </div>

      <div>
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          {/* 헤더 */}
          <div className="px-4 py-3 border-b border-gray-800/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-300">보유 종목</h2>
              {pricesLoading && (
                <span className="text-xs text-gray-600 animate-pulse">시세 조회 중...</span>
              )}
            </div>
            {rows.length > 0 && (
              <div className="flex rounded-lg overflow-hidden border border-gray-700">
                {(['전체', '시장별', '계좌별'] as ViewMode[]).map((m) => (
                  <button key={m} onClick={() => setViewMode(m)}
                    className={`px-3 py-1 text-xs transition-colors ${
                      viewMode === m ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >{m}</button>
                ))}
              </div>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="px-4 py-12 text-center text-gray-600 text-sm">
              보유 종목이 없습니다. 종목을 추가해주세요.
            </div>

          ) : viewMode === '전체' ? (
            /* ── 전체: 티커별 합산 + 아코디언 ── */
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><TH /></thead>
                <tbody>
                  {tickerGroups.map((g) => {
                    const isExpanded = expanded.has(g.ticker);
                    const multi = g.rows.length > 1;
                    const weight = totalValueKRW > 0 ? (g.totalValue / totalValueKRW) * 100 : 0;
                    return (
                      <Fragment key={g.ticker}>
                        <tr
                          onClick={() => multi && toggleExpand(g.ticker)}
                          className={`border-b border-gray-800/50 transition-colors ${multi ? 'cursor-pointer hover:bg-gray-800/50' : 'hover:bg-gray-800/30'}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="w-3 text-center text-gray-500 text-xs shrink-0">
                                {multi ? (isExpanded ? '▼' : '▶') : ''}
                              </span>
                              <div className="flex flex-col">
                                <span className="font-medium text-white">{g.name}</span>
                                <span className="text-xs text-gray-500">
                                  {g.ticker} · {g.market} · {g.currency} · <span className="private-value">{fmt(g.rows.reduce((s, r) => s + r.holding.quantity, 0))}주</span>
                                  {multi && <span className="text-blue-500 ml-1">({g.rows.length}개 계좌)</span>}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {g.priceLoading ? (
                              <div className="flex flex-col items-end gap-1">
                                <Skeleton w="w-20" />
                                <Skeleton w="w-28" />
                              </div>
                            ) : (
                              <div className="flex flex-col items-end">
                                <span className="text-white private-value">
                                  {g.currency === 'USD' ? `$${fmt(g.currentPrice)}` : `₩${fmt(g.currentPrice)}`}
                                </span>
                                {g.currency === 'USD' && usdKrw > 0 && (
                                  <span className="text-xs text-gray-500 private-value">₩{fmt(Math.round(g.currentPrice * usdKrw))}</span>
                                )}
                                {g.priceOk
                                  ? <DailyChange change={g.change} changeRate={g.changeRate} currency={g.currency} />
                                  : <span className="text-xs text-yellow-600">매입가 기준</span>
                                }
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-white">
                            {g.priceLoading ? <Skeleton w="w-24" /> : <span className="private-value">₩{fmt(Math.round(g.totalValue))}</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {g.priceLoading ? <Skeleton w="w-16" /> : (
                              <span className={`private-value ${g.gainLossRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {fmtPct(g.gainLossRate)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-300">
                            {g.priceLoading ? <Skeleton w="w-10" /> : `${weight.toFixed(1)}%`}
                          </td>
                          <td className="px-4 py-3">
                            {!multi && <ActionButtons holding={g.rows[0].holding} />}
                          </td>
                        </tr>

                        {/* 확장: 계좌별 세부 행 */}
                        {multi && isExpanded && g.rows.map((row) => {
                          const broker = row.holding.account?.broker ?? '';
                          const acctLabel = row.holding.account
                            ? `${broker} — ${row.holding.account.name}`
                            : '계좌 미지정';
                          const color = brokerColor(broker);
                          const rowWeight = totalValueKRW > 0 ? (row.currentValueKRW / totalValueKRW) * 100 : 0;
                          return (
                            <tr
                              key={`sub-${row.holding.id}`}
                              className="border-b border-gray-800/50/50 bg-gray-800/20 hover:bg-gray-800/40 transition-colors"
                            >
                              <td className="px-4 py-2">
                                <div className="flex items-start gap-3 pl-5 border-l-2 border-gray-700 ml-1">
                                  <div className="flex flex-col">
                                    <span className="flex items-center gap-1.5 text-xs">
                                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                      <span style={{ color }}>{acctLabel}</span>
                                    </span>
                                    <span className="text-xs text-gray-500 mt-0.5">
                                      {row.holding.quantity}주 · 매입가 <span className="private-value">{row.holding.currency === 'USD' ? '$' : '₩'}{fmt(row.holding.avgPrice)}</span>
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-2" />
                              <td className="px-4 py-2 text-right text-sm text-gray-300">
                                {row.priceLoading ? <Skeleton w="w-20" /> : <span className="private-value">₩{fmt(Math.round(row.currentValueKRW))}</span>}
                              </td>
                              <td className="px-4 py-2 text-right">
                                {row.priceLoading ? <Skeleton w="w-14" /> : (
                                  <span className={`text-sm private-value ${row.gainLossRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {fmtPct(row.gainLossRate)}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right text-xs text-gray-500">
                                {row.priceLoading ? <Skeleton w="w-10" /> : `${rowWeight.toFixed(1)}%`}
                              </td>
                              <td className="px-4 py-2"><ActionButtons holding={row.holding} /></td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

          ) : viewMode === '시장별' ? (
            /* ── 시장별 뷰 ── */
            <div>
              {marketGroups.map((mg) => {
                const gainLoss = mg.subtotal - mg.cost;
                const rate = mg.cost > 0 ? (gainLoss / mg.cost) * 100 : 0;
                const color = mg.market === 'KR' ? '#60a5fa' : '#34d399';
                return (
                  <div key={mg.market} className="border-b border-gray-800/50 last:border-0">
                    <div
                      className="px-4 py-2 bg-gray-800/40 flex items-center justify-between border-l-4"
                      style={{ borderLeftColor: color }}
                    >
                      <span className="text-xs font-semibold" style={{ color }}>{mg.label}</span>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-gray-300 private-value">₩{fmt(Math.round(mg.subtotal))}</span>
                        <span className={`private-value ${rate >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtPct(rate)}</span>
                        <span className="text-gray-500">{((mg.subtotal / totalValueKRW) * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><TH /></thead>
                        <tbody>
                          {[...mg.rows].sort((a, b) => b.currentValueKRW - a.currentValueKRW).map((row) => {
                            const weight = totalValueKRW > 0 ? (row.currentValueKRW / totalValueKRW) * 100 : 0;
                            const currentPrice = row.priceOk ? row.price!.currentPrice : row.holding.avgPrice;
                            return (
                              <tr key={row.holding.id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/50 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex flex-col">
                                    <span className="font-medium text-white">{row.holding.name}</span>
                                    <span className="text-xs text-gray-500">
                                      {row.holding.ticker} · {row.holding.currency} · <span className="private-value">{fmt(row.holding.quantity)}주</span>
                                      {row.holding.account && (
                                        <span className="ml-1" style={{ color: brokerColor(row.holding.account.broker) }}>
                                          · {row.holding.account.broker} {row.holding.account.name}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {row.priceLoading ? (
                                    <div className="flex flex-col items-end gap-1"><Skeleton w="w-20" /><Skeleton w="w-28" /></div>
                                  ) : (
                                    <div className="flex flex-col items-end">
                                      <span className="text-white private-value">
                                        {row.holding.currency === 'USD' ? `$${fmt(currentPrice)}` : `₩${fmt(currentPrice)}`}
                                      </span>
                                      {row.holding.currency === 'USD' && usdKrw > 0 && (
                                        <span className="text-xs text-gray-500 private-value">₩{fmt(Math.round(currentPrice * usdKrw))}</span>
                                      )}
                                      {row.priceOk
                                        ? <DailyChange change={row.price!.change ?? 0} changeRate={row.price!.changeRate ?? 0} currency={row.holding.currency} />
                                        : <span className="text-xs text-yellow-600">매입가 기준</span>
                                      }
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right text-white">
                                  {row.priceLoading ? <Skeleton w="w-24" /> : <span className="private-value">₩{fmt(Math.round(row.currentValueKRW))}</span>}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {row.priceLoading ? <Skeleton w="w-16" /> : (
                                    <span className={`private-value ${row.gainLossRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                      {fmtPct(row.gainLossRate)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right text-gray-300">
                                  {row.priceLoading ? <Skeleton w="w-10" /> : `${weight.toFixed(1)}%`}
                                </td>
                                <td className="px-4 py-3"><ActionButtons holding={row.holding} /></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>

          ) : (
            /* ── 계좌별 뷰 ── */
            <div>
              {acctGroups.map((ag) => {
                const gainLoss = ag.subtotal - ag.cost;
                const rate = ag.cost > 0 ? (gainLoss / ag.cost) * 100 : 0;
                const color = brokerColor(ag.broker);
                return (
                  <div key={ag.label} className="border-b border-gray-800/50 last:border-0">
                    <div
                      className="px-4 py-2 bg-gray-800/40 flex items-center justify-between border-l-4"
                      style={{ borderLeftColor: color }}
                    >
                      <span className="flex items-center gap-2 text-xs font-semibold">
                        <span style={{ color }}>{ag.label}</span>
                      </span>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-gray-300 private-value">₩{fmt(Math.round(ag.subtotal))}</span>
                        <span className={`private-value ${rate >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtPct(rate)}</span>
                        <span className="text-gray-500">{((ag.subtotal / totalValueKRW) * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><TH /></thead>
                        <tbody>
                          {[...ag.rows].sort((a, b) => b.currentValueKRW - a.currentValueKRW).map((row) => {
                            const weight = totalValueKRW > 0 ? (row.currentValueKRW / totalValueKRW) * 100 : 0;
                            const currentPrice = row.priceOk ? row.price!.currentPrice : row.holding.avgPrice;
                            return (
                              <tr key={row.holding.id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/50 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex flex-col">
                                    <span className="font-medium text-white">{row.holding.name}</span>
                                    <span className="text-xs text-gray-500">
                                      {row.holding.ticker} · {row.holding.market} · {row.holding.currency} · <span className="private-value">{fmt(row.holding.quantity)}주</span>
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {row.priceLoading ? (
                                    <div className="flex flex-col items-end gap-1"><Skeleton w="w-20" /><Skeleton w="w-28" /></div>
                                  ) : (
                                    <div className="flex flex-col items-end">
                                      <span className="text-white private-value">
                                        {row.holding.currency === 'USD' ? `$${fmt(currentPrice)}` : `₩${fmt(currentPrice)}`}
                                      </span>
                                      {row.holding.currency === 'USD' && usdKrw > 0 && (
                                        <span className="text-xs text-gray-500 private-value">₩{fmt(Math.round(currentPrice * usdKrw))}</span>
                                      )}
                                      {row.priceOk
                                        ? <DailyChange change={row.price!.change ?? 0} changeRate={row.price!.changeRate ?? 0} currency={row.holding.currency} />
                                        : <span className="text-xs text-yellow-600">매입가 기준</span>
                                      }
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right text-white">
                                  {row.priceLoading ? <Skeleton w="w-24" /> : <span className="private-value">₩{fmt(Math.round(row.currentValueKRW))}</span>}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {row.priceLoading ? <Skeleton w="w-16" /> : (
                                    <span className={`private-value ${row.gainLossRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                      {fmtPct(row.gainLossRate)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right text-gray-300">
                                  {row.priceLoading ? <Skeleton w="w-10" /> : `${weight.toFixed(1)}%`}
                                </td>
                                <td className="px-4 py-3"><ActionButtons holding={row.holding} /></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {anyPriceFail && (
          <div className="mt-4 px-4 py-3 bg-yellow-900/30 border border-yellow-800/50 rounded-lg text-xs text-yellow-500">
            일부 종목의 시세 조회에 실패했습니다. 매입가 기준으로 표시합니다.
          </div>
        )}
      </div>

      {/* 수정 모달 */}
      {editingHolding && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 pt-16 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) setEditingHolding(null); }}
        >
          <div className="bg-gray-900 rounded-xl p-5 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-gray-400">{editingHolding.name} 수정</h2>
              <button onClick={() => setEditingHolding(null)} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
            </div>
            <HoldingForm
              editing={editingHolding}
              onDone={() => { setEditingHolding(null); router.refresh(); }}
              initialAccounts={accounts}
            />
          </div>
        </div>
      )}
    </>
  );
}
