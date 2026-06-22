'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import type { Trade, Holding } from '@/types';
import HoldingPicker from '@/components/HoldingPicker';
import JournalStockPicker from '@/components/JournalStockPicker';

interface PnLEntry {
  realizedPnl: number;
  pnlPct: number;
  avgCost: number;
}

function computeRealizedPnL(trades: Trade[]): Record<string, PnLEntry> {
  const byHolding: Record<string, Trade[]> = {};
  for (const t of trades) {
    if (!byHolding[t.holdingId]) byHolding[t.holdingId] = [];
    byHolding[t.holdingId].push(t);
  }

  const result: Record<string, PnLEntry> = {};

  for (const holdingTrades of Object.values(byHolding)) {
    const sorted = [...holdingTrades].sort((a, b) => {
      const da = new Date(a.tradeDate).getTime();
      const db = new Date(b.tradeDate).getTime();
      if (da !== db) return da - db;
      // 동일 날짜: 매수 먼저 처리 (수도결제 이동평균 규칙)
      if (a.type === 'BUY' && b.type === 'SELL') return -1;
      if (a.type === 'SELL' && b.type === 'BUY') return 1;
      return 0;
    });

    let runningQty = 0;
    let runningTotalCost = 0;

    for (const trade of sorted) {
      if (trade.type === 'BUY') {
        runningTotalCost += trade.quantity * trade.price;
        runningQty += trade.quantity;
      } else if (trade.type === 'SELL' && runningQty > 0) {
        const avgCost = runningTotalCost / runningQty;
        const realizedPnl = (trade.price - avgCost) * trade.quantity - (trade.fee ?? 0);
        const pnlPct = ((trade.price - avgCost) * trade.quantity - (trade.fee ?? 0)) / (avgCost * trade.quantity) * 100;
        result[trade.id] = { realizedPnl, pnlPct, avgCost };
        runningQty = Math.max(0, runningQty - trade.quantity);
        runningTotalCost = runningQty * avgCost;
      }
    }
  }

  return result;
}

type Period = 'all' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

const PERIOD_LABELS: Record<Period, string> = {
  all: '전체',
  week: '이번 주',
  month: '이번 달',
  quarter: '이번 분기',
  year: '올해',
  custom: '직접 설정',
};

function isInPeriod(dateStr: string, period: Period, customFrom?: string, customTo?: string): boolean {
  if (period === 'all') return true;
  const d = new Date(dateStr.split('T')[0]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === 'custom') {
    const from = customFrom ? new Date(customFrom) : null;
    const to = customTo ? new Date(customTo) : null;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }
  if (period === 'week') {
    const dow = today.getDay();
    const diffToMon = dow === 0 ? 6 : dow - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - diffToMon);
    return d >= monday && d <= today;
  }
  if (period === 'month') {
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  }
  if (period === 'quarter') {
    const q = Math.floor(today.getMonth() / 3);
    const qStart = new Date(today.getFullYear(), q * 3, 1);
    const qEnd = new Date(today.getFullYear(), q * 3 + 3, 0);
    return d >= qStart && d <= qEnd;
  }
  if (period === 'year') {
    return d.getFullYear() === today.getFullYear();
  }
  return true;
}

type TradeForm = {
  holdingId: string;
  type: 'BUY' | 'SELL';
  quantity: string;
  price: string;
  fee: string;
  tradeDate: string;
  thesis: string;
};

const emptyForm = (): TradeForm => ({
  holdingId: '',
  type: 'BUY',
  quantity: '',
  price: '',
  fee: '',
  tradeDate: new Date().toISOString().split('T')[0],
  thesis: '',
});

function fmt(n: number) {
  return n.toLocaleString('ko-KR');
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function JournalPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterHoldingId, setFilterHoldingId] = useState('');
  const [form, setForm] = useState<TradeForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [usdKrw, setUsdKrw] = useState(0);
  const [typeFilter, setTypeFilter] = useState<'all' | 'BUY' | 'SELL'>('all');
  const [pageSize, setPageSize] = useState<10 | 30 | 50>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [tickerTableOpen, setTickerTableOpen] = useState(true);
  const [tickerSort, setTickerSort] = useState<'desc' | 'asc'>('desc');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, tRes, fxRes] = await Promise.all([
        fetch('/api/holdings'),
        fetch('/api/trades'),
        fetch('/api/kis/fx'),
      ]);
      if (hRes.ok) setHoldings(await hRes.json());
      if (tRes.ok) setTrades(await tRes.json());
      if (fxRes.ok) {
        const fx = await fxRes.json();
        if (fx?.usdKrw) setUsdKrw(fx.usdKrw);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.holdingId || !form.quantity || !form.price) {
      setError('종목, 수량, 가격은 필수입니다.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const body = {
        holdingId: form.holdingId,
        type: form.type,
        quantity: parseFloat(form.quantity),
        price: parseFloat(form.price),
        fee: form.fee ? parseFloat(form.fee) : null,
        tradeDate: form.tradeDate,
        thesis: form.thesis || null,
      };

      if (editingId) {
        const res = await fetch(`/api/trades/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('수정 실패');
      } else {
        const res = await fetch('/api/trades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('등록 실패');
      }
      setForm(emptyForm());
      setEditingId(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (trade: Trade) => {
    setEditingId(trade.id);
    setForm({
      holdingId: trade.holdingId,
      type: trade.type,
      quantity: String(trade.quantity),
      price: String(trade.price),
      fee: String(trade.fee ?? ''),
      tradeDate: trade.tradeDate.split('T')[0],
      thesis: trade.thesis ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 매매 기록을 삭제할까요?')) return;
    try {
      const res = await fetch(`/api/trades/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 오류');
    }
  };

  const handleCancel = () => {
    setForm(emptyForm());
    setEditingId(null);
    setError('');
  };

  const pnlMap = useMemo(() => computeRealizedPnL(trades), [trades]);

  const pnlSummary = useMemo(() => {
    let totalKRW = 0, totalUSD = 0;
    let wins = 0, losses = 0;
    const byTicker: Record<string, { name: string; currency: string; pnl: number; wins: number; losses: number }> = {};

    for (const trade of trades) {
      if (trade.type !== 'SELL') continue;
      if (!isInPeriod(trade.tradeDate, period, customFrom, customTo)) continue;
      const pnl = pnlMap[trade.id];
      if (!pnl) continue;

      const currency = trade.holding?.currency ?? 'KRW';
      const ticker = trade.holding?.ticker ?? trade.holdingId;
      const name = holdings.find((h) => h.id === trade.holdingId)?.name ?? ticker;

      if (pnl.realizedPnl >= 0) wins++; else losses++;

      if (currency === 'USD') {
        totalUSD += pnl.realizedPnl;
      } else {
        totalKRW += pnl.realizedPnl;
      }

      if (!byTicker[ticker]) {
        byTicker[ticker] = { name, currency, pnl: 0, wins: 0, losses: 0 };
      }
      byTicker[ticker].pnl += pnl.realizedPnl;
      if (pnl.realizedPnl >= 0) byTicker[ticker].wins++; else byTicker[ticker].losses++;
    }

    const totalCombinedKRW = totalKRW + totalUSD * (usdKrw || 1);
    const hasUSD = totalUSD !== 0 || Object.values(byTicker).some((t) => t.currency === 'USD');
    const tickerList = Object.entries(byTicker).sort((a, b) => Math.abs(b[1].pnl) - Math.abs(a[1].pnl));

    return { totalKRW, totalUSD, totalCombinedKRW, wins, losses, tickerList, hasUSD };
  }, [trades, pnlMap, holdings, period, customFrom, customTo, usdKrw]);

  const allHasSells = trades.some((t) => t.type === 'SELL');

  const filteredTrades = useMemo(
    () =>
      [...trades]
        .filter((t) => !filterHoldingId || t.holdingId === filterHoldingId)
        .filter((t) => typeFilter === 'all' || t.type === typeFilter)
        .sort((a, b) => new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime()),
    [trades, filterHoldingId, typeFilter]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filterHoldingId, typeFilter, pageSize]);

  const totalPages = Math.ceil(filteredTrades.length / pageSize);
  const paginatedTrades = filteredTrades.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const tradedHoldings = useMemo(() => {
    const tradedIds = new Set(trades.map((t) => t.holdingId));
    return holdings.filter((h) => tradedIds.has(h.id));
  }, [holdings, trades]);

  const holdingName = (id: string) =>
    holdings.find((h) => h.id === id)?.name ?? id;

  const pnlColor = (n: number) => n >= 0 ? 'text-green-400' : 'text-red-400';
  const pnlSign = (n: number) => n >= 0 ? '+' : '-';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-white">매매일지</h1>
        <Link
          href="/journal/import"
          className="px-3 py-1.5 text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
        >
          CSV 가져오기
        </Link>
      </div>

      {/* 입력 폼 */}
      <div className="bg-gray-900 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4">
          {editingId ? '매매 기록 수정' : '매매 기록 추가'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 종목 선택 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">종목 *</label>
              <JournalStockPicker
                holdings={holdings}
                recentHoldings={tradedHoldings}
                value={form.holdingId}
                onChange={(id) => setForm((f) => ({ ...f, holdingId: id }))}
                onNewHolding={(h) => setHoldings((prev) => [...prev, h])}
              />
            </div>

            {/* 거래 유형 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">구분 *</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-700">
                {(['BUY', 'SELL'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      form.type === t
                        ? t === 'BUY'
                          ? 'bg-blue-600 text-white'
                          : 'bg-red-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {t === 'BUY' ? '매수' : '매도'}
                  </button>
                ))}
              </div>
            </div>

            {/* 날짜 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">날짜 *</label>
              <input
                type="date"
                value={form.tradeDate}
                onChange={(e) => setForm((f) => ({ ...f, tradeDate: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* 수량 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">수량 *</label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                placeholder="0"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* 가격 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                가격 (원/달러) *
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="0"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* 수수료 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                수수료 (선택)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.fee}
                onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))}
                placeholder="0"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* 거래 금액 미리보기 */}
            <div className="flex items-end">
              <div className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500 mb-1">거래 금액 (참고)</p>
                <p className="text-sm text-white">
                  {form.quantity && form.price
                    ? fmt(
                        Math.round(
                          parseFloat(form.quantity) * parseFloat(form.price)
                        )
                      )
                    : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Thesis */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              투자 근거 / 반증조건 (thesis)
            </label>
            <textarea
              value={form.thesis}
              onChange={(e) => setForm((f) => ({ ...f, thesis: e.target.value }))}
              rows={3}
              placeholder="매매 근거, 목표 주가, 반증조건 등을 자유롭게 기록하세요."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-y min-h-[76px]"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? '저장 중...' : editingId ? '수정 완료' : '기록 추가'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                취소
              </button>
            )}
          </div>
        </form>
      </div>

      {/* 실현 손익 요약 */}
      {allHasSells && (
        <div className="mb-6">
          {/* 기간 토글 */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex items-center gap-1 bg-gray-900 rounded-xl p-1">
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    period === p
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
            {period === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <span className="text-xs text-gray-500">~</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
          </div>

          {/* 요약 카드 4개 */}
          {(() => {
            const { totalKRW, totalUSD, totalCombinedKRW, wins, losses } = pnlSummary;
            const total = wins + losses;
            const winRate = total > 0 ? (wins / total) * 100 : 0;

            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div className="bg-gray-900 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">실현손익 합산</p>
                  <p className={`text-lg font-bold ${pnlColor(totalCombinedKRW)}`}>
                    <span className="private-value">
                      {pnlSign(totalCombinedKRW)}₩{fmt(Math.round(Math.abs(totalCombinedKRW)))}
                    </span>
                  </p>
                  {usdKrw > 0 && totalUSD !== 0 && (
                    <p className="text-xs text-gray-600 mt-0.5">
                      환율 {fmt(usdKrw)}원 기준
                    </p>
                  )}
                </div>

                <div className="bg-gray-900 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">실현손익 (KRW)</p>
                  <p className={`text-lg font-bold ${totalKRW !== 0 ? pnlColor(totalKRW) : 'text-gray-600'}`}>
                    <span className="private-value">
                      {totalKRW !== 0 ? `${pnlSign(totalKRW)}₩${fmt(Math.round(Math.abs(totalKRW)))}` : '₩0'}
                    </span>
                  </p>
                </div>

                <div className="bg-gray-900 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">실현손익 (USD)</p>
                  <p className={`text-lg font-bold ${totalUSD !== 0 ? pnlColor(totalUSD) : 'text-gray-600'}`}>
                    <span className="private-value">
                      {totalUSD !== 0 ? `${pnlSign(totalUSD)}$${Math.abs(totalUSD).toFixed(2)}` : '$0'}
                    </span>
                  </p>
                </div>

                <div className="bg-gray-900 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">승률</p>
                  <p className="text-lg font-bold text-white">
                    {total > 0 ? `${winRate.toFixed(0)}%` : '-'}
                  </p>
                  {total > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      <span className="text-green-400">{wins}승</span>
                      {' '}
                      <span className="text-red-400">{losses}패</span>
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 종목별 테이블 */}
          {pnlSummary.tickerList.length > 0 && (
            <div className="bg-gray-900 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-800">
                <button
                  type="button"
                  onClick={() => setTickerTableOpen((o) => !o)}
                  className="flex-1 flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-800/40 transition-colors"
                >
                  <h2 className="text-sm font-semibold text-gray-300">종목별 실현 손익</h2>
                  <span className="text-xs text-gray-600">{PERIOD_LABELS[period]} · {pnlSummary.tickerList.length}종목</span>
                  <span className="text-gray-600 text-xs ml-auto">{tickerTableOpen ? '▲' : '▼'}</span>
                </button>
                {tickerTableOpen && (
                  <button
                    type="button"
                    onClick={() => setTickerSort((s) => s === 'desc' ? 'asc' : 'desc')}
                    className="flex items-center gap-1 px-3 py-3 text-xs text-gray-500 hover:text-gray-300 transition-colors shrink-0 border-l border-gray-800"
                  >
                    손익순 {tickerSort === 'desc' ? '↓' : '↑'}
                  </button>
                )}
              </div>
              {tickerTableOpen && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-800">
                        <th className="px-4 py-3 text-left">종목</th>
                        <th className="px-4 py-3 text-right">실현 손익</th>
                        <th className="px-4 py-3 text-right">승/패</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...pnlSummary.tickerList]
                        .sort((a, b) => tickerSort === 'desc' ? b[1].pnl - a[1].pnl : a[1].pnl - b[1].pnl)
                        .map(([ticker, s]) => (
                          <tr key={ticker} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                            <td className="px-4 py-3">
                              <p className="font-medium text-white">{s.name}</p>
                              <p className="text-xs text-gray-500">{ticker}</p>
                            </td>
                            <td className={`px-4 py-3 text-right font-medium ${pnlColor(s.pnl)}`}>
                              <span className="private-value">
                                {pnlSign(s.pnl)}
                                {s.currency === 'USD'
                                  ? `$${Math.abs(s.pnl).toFixed(2)}`
                                  : `₩${fmt(Math.round(Math.abs(s.pnl)))}`}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-gray-400">
                              <span className="text-green-400">{s.wins}승</span>
                              {' '}
                              <span className="text-red-400">{s.losses}패</span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {pnlSummary.tickerList.length === 0 && (
            <div className="bg-gray-900 rounded-xl p-6 text-center text-gray-600 text-sm">
              {PERIOD_LABELS[period]} 실현 손익이 없습니다.
            </div>
          )}
        </div>
      )}

      {/* 필터 */}
      <div className="space-y-2 mb-4">
        {/* 1행: 매수/매도 토글 + 페이지 크기 */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex rounded-lg overflow-hidden border border-gray-800">
            {(['all', 'BUY', 'SELL'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  typeFilter === t
                    ? t === 'BUY'
                      ? 'bg-blue-600/70 text-blue-200'
                      : t === 'SELL'
                      ? 'bg-red-600/70 text-red-200'
                      : 'bg-gray-700 text-white'
                    : 'bg-gray-900 text-gray-500 hover:text-gray-300'
                }`}
              >
                {t === 'all' ? '전체' : t === 'BUY' ? '매수' : '매도'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">{filteredTrades.length}건</span>
            <div className="flex rounded-lg overflow-hidden border border-gray-800">
              {([10, 30, 50] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPageSize(n)}
                  className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    pageSize === n
                      ? 'bg-gray-700 text-white'
                      : 'bg-gray-900 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {n}줄
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* 2행: 종목 필터 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 shrink-0">종목:</label>
          <div className="w-52">
            <HoldingPicker
              holdings={holdings}
              value={filterHoldingId}
              onChange={setFilterHoldingId}
              placeholder="전체 (종목명 입력)"
            />
          </div>
          {filterHoldingId && (
            <button
              type="button"
              onClick={() => setFilterHoldingId('')}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {/* 타임라인 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-900 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredTrades.length === 0 ? (
        <div className="bg-gray-900 rounded-xl p-12 text-center text-gray-600 text-sm">
          매매 기록이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedTrades.map((trade) => {
            const holding = holdings.find((h) => h.id === trade.holdingId);
            const totalAmt = trade.quantity * trade.price;
            return (
              <div
                key={trade.id}
                className={`bg-gray-900 rounded-xl p-4 border-l-4 ${
                  trade.type === 'BUY'
                    ? 'border-blue-500'
                    : 'border-red-500'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${
                          trade.type === 'BUY'
                            ? 'bg-blue-600/30 text-blue-400'
                            : 'bg-red-600/30 text-red-400'
                        }`}
                      >
                        {trade.type === 'BUY' ? '매수' : '매도'}
                      </span>
                      <span className="font-medium text-white">
                        {holdingName(trade.holdingId)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {holding?.ticker}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300">
                      {fmt(trade.quantity)}주 ×{' '}
                      <span className="private-value">
                        {holding?.currency === 'USD'
                          ? `$${trade.price.toFixed(2)}`
                          : `₩${fmt(trade.price)}`}
                      </span>
                      {' '}={' '}
                      <span className="text-white font-medium private-value">
                        {holding?.currency === 'USD'
                          ? `$${totalAmt.toFixed(2)}`
                          : `₩${fmt(Math.round(totalAmt))}`}
                      </span>
                    </p>
                    {trade.type === 'SELL' && pnlMap[trade.id] && (() => {
                      const { realizedPnl, pnlPct, avgCost } = pnlMap[trade.id];
                      const isProfit = realizedPnl >= 0;
                      const color = isProfit ? 'text-green-400' : 'text-red-400';
                      const currency = holding?.currency ?? 'KRW';
                      const pnlStr = currency === 'USD'
                        ? `${isProfit ? '+' : ''}$${Math.abs(realizedPnl).toFixed(2)}`
                        : `${isProfit ? '+' : '-'}₩${fmt(Math.round(Math.abs(realizedPnl)))}`;
                      const avgCostStr = currency === 'USD'
                        ? `$${avgCost.toFixed(2)}`
                        : `₩${fmt(Math.round(avgCost))}`;
                      return (
                        <div className="mt-2 flex items-center gap-3 text-sm">
                          <span className={`font-bold ${color} private-value`}>
                            실현 손익 {pnlStr}
                          </span>
                          <span className={`text-xs font-medium ${color} private-value`}>
                            ({isProfit ? '+' : ''}{pnlPct.toFixed(2)}%)
                          </span>
                          <span className="text-xs text-gray-600 private-value">
                            평균단가 {avgCostStr}
                          </span>
                        </div>
                      );
                    })()}
                    {trade.fee != null && trade.fee > 0 && (
                      <p className="mt-1 text-xs text-gray-500 private-value">
                        수수료{' '}
                        {holding?.currency === 'USD'
                          ? `$${trade.fee.toFixed(2)}`
                          : `₩${fmt(Math.round(trade.fee))}`}
                      </p>
                    )}
                    {trade.thesis && (
                      <p className="mt-2 text-xs text-gray-400 bg-gray-800/60 rounded px-2 py-1.5 whitespace-pre-wrap">
                        {trade.thesis}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-xs text-gray-500">
                      {formatDate(trade.tradeDate)}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(trade)}
                        className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(trade.id)}
                        className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 text-xs text-gray-400 bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            이전
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
              .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…');
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                p === '…' ? (
                  <span key={`ellipsis-${idx}`} className="text-xs text-gray-600 px-1">…</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCurrentPage(p as number)}
                    className={`w-7 h-7 text-xs rounded-lg transition-colors ${
                      currentPage === p
                        ? 'bg-gray-700 text-white font-medium'
                        : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
          </div>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 text-xs text-gray-400 bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
