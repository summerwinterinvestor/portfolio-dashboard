'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Dividend, Holding, PriceData } from '@/types';
import DividendChart from '@/components/DividendChart';
import JournalStockPicker from '@/components/JournalStockPicker';

type DivForm = {
  holdingId: string;
  amount: string;
  paidDate: string;
};

const emptyForm = (): DivForm => ({
  holdingId: '',
  amount: '',
  paidDate: new Date().toISOString().split('T')[0],
});

function fmt(n: number) {
  return n.toLocaleString('ko-KR');
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ko-KR');
}

// ── 기간 필터 ─────────────────────────────────────────────────────

type DivPeriod = 'all' | 'quarter' | 'year' | 'custom';

const PERIOD_LABELS: Record<DivPeriod, string> = {
  all: '전체',
  quarter: '이번 분기',
  year: '올해',
  custom: '직접 설정',
};

function isInPeriod(dateStr: string, period: DivPeriod, from?: string, to?: string): boolean {
  if (period === 'all') return true;
  const d = new Date(dateStr.split('T')[0]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === 'custom') {
    if (from && d < new Date(from)) return false;
    if (to && d > new Date(to)) return false;
    return true;
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

// ── 메인 ─────────────────────────────────────────────────────────

export default function DividendsPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [usdKrw, setUsdKrw] = useState(0);
  const [loading, setLoading] = useState(true);
  const [chartView, setChartView] = useState<'monthly' | 'yearly'>('monthly');
  const [period, setPeriod] = useState<DivPeriod>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [form, setForm] = useState<DivForm>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [recordsOpen, setRecordsOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;
  const [editingDivId, setEditingDivId] = useState<string | null>(null);
  const [editDivForm, setEditDivForm] = useState({ amount: '', paidDate: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, dRes, fxRes] = await Promise.all([
        fetch('/api/holdings'),
        fetch('/api/dividends'),
        fetch('/api/kis/fx'),
      ]);
      const holdingsData: Holding[] = hRes.ok ? await hRes.json() : [];
      const dividendsData: Dividend[] = dRes.ok ? await dRes.json() : [];
      if (fxRes.ok) {
        const fx = await fxRes.json();
        if (fx?.usdKrw) setUsdKrw(fx.usdKrw);
      }
      setHoldings(holdingsData);
      setDividends(dividendsData);
      setLoading(false);

      // 현재가는 배당 있는 종목만 백그라운드에서 조회
      const dividedIds = new Set(dividendsData.map((d) => d.holdingId));
      const targets = holdingsData.filter((h) => dividedIds.has(h.id));
      const priceMap: Record<string, PriceData> = {};
      await Promise.all(
        targets.map(async (h) => {
          try {
            const params = new URLSearchParams({ ticker: h.ticker, market: h.market });
            if (h.market === 'US') params.set('exchange', h.exchange ?? 'NAS');
            const res = await fetch(`/api/kis/price?${params}`);
            if (res.ok) priceMap[h.id] = await res.json();
          } catch { /* ignore */ }
        })
      );
      setPrices(priceMap);
    } catch {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.holdingId || !form.amount) {
      setError('종목과 배당금은 필수입니다.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/dividends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdingId: form.holdingId,
          amount: parseFloat(form.amount),
          paidDate: form.paidDate,
        }),
      });
      if (!res.ok) throw new Error('등록 실패');
      setForm(emptyForm());
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 배당 기록을 삭제할까요?')) return;
    try {
      const res = await fetch(`/api/dividends/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 오류');
    }
  };

  const handleEditDiv = (div: Dividend) => {
    setEditingDivId(div.id);
    setEditDivForm({
      amount: String(div.amount),
      paidDate: div.paidDate.split('T')[0],
    });
  };

  const handleUpdateDiv = async () => {
    if (!editingDivId) return;
    try {
      const res = await fetch(`/api/dividends/${editingDivId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(editDivForm.amount),
          paidDate: editDivForm.paidDate,
        }),
      });
      if (!res.ok) throw new Error('수정 실패');
      setEditingDivId(null);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '수정 오류');
    }
  };

  // ── 통화 판별 ──────────────────────────────────────────────────
  const getDivCurrency = (div: Dividend): 'KRW' | 'USD' => {
    // API에서 holding.currency 포함, 없으면 holdings 목록에서 찾기
    if (div.holding?.currency) return div.holding.currency as 'KRW' | 'USD';
    return holdings.find((h) => h.id === div.holdingId)?.currency ?? 'KRW';
  };

  // ── 기간 필터 적용된 배당 ──────────────────────────────────────
  const filteredDivs = useMemo(() => {
    setCurrentPage(1);
    return dividends.filter((d) => isInPeriod(d.paidDate, period, customFrom, customTo));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dividends, period, customFrom, customTo]);

  // ── 요약 계산 ─────────────────────────────────────────────────
  const summary = useMemo(() => {
    let totalKRW = 0, totalUSD = 0;
    for (const d of filteredDivs) {
      if (getDivCurrency(d) === 'USD') totalUSD += d.amount;
      else totalKRW += d.amount;
    }
    const totalCombined = totalKRW + totalUSD * (usdKrw || 1);
    return { totalKRW, totalUSD, totalCombined };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredDivs, usdKrw]);

  // ── 종목별 집계 (전체 기간 기준) ───────────────────────────────
  const holdingDividendMap: Record<string, { total: number; byYear: Record<string, number>; currency: string }> = {};
  for (const div of dividends) {
    const currency = getDivCurrency(div);
    if (!holdingDividendMap[div.holdingId]) {
      holdingDividendMap[div.holdingId] = { total: 0, byYear: {}, currency };
    }
    const year = new Date(div.paidDate).getFullYear().toString();
    holdingDividendMap[div.holdingId].total += div.amount;
    holdingDividendMap[div.holdingId].byYear[year] =
      (holdingDividendMap[div.holdingId].byYear[year] ?? 0) + div.amount;
  }

  // ── 차트용 집계 ───────────────────────────────────────────────
  const monthlyMap: Record<string, number> = {};
  const yearlyMap: Record<string, number> = {};
  for (const div of dividends) {
    const monthKey = div.paidDate.slice(0, 7);
    const yearKey = new Date(div.paidDate).getFullYear().toString();
    const amtKrw = getDivCurrency(div) === 'USD'
      ? div.amount * (usdKrw || 1)
      : div.amount;
    monthlyMap[monthKey] = (monthlyMap[monthKey] ?? 0) + amtKrw;
    yearlyMap[yearKey] = (yearlyMap[yearKey] ?? 0) + amtKrw;
  }
  // 데이터 있는 연도의 1~12월 전체 표시 (데이터 없는 달은 0)
  const dataYears = Object.keys(yearlyMap).map(Number).sort();
  if (dataYears.length === 0) dataYears.push(new Date().getFullYear());
  const monthlyData = dataYears.flatMap((year) =>
    Array.from({ length: 12 }, (_, i) => {
      const label = `${year}-${String(i + 1).padStart(2, '0')}`;
      return { label, amount: monthlyMap[label] ?? 0 };
    })
  );
  const yearlyData = Object.entries(yearlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, amount]) => ({ label, amount }));

  const currentYear = new Date().getFullYear().toString();
  const sortedDivs = [...filteredDivs].sort(
    (a, b) => new Date(b.paidDate).getTime() - new Date(a.paidDate).getTime()
  );

  return (
    <div>
      <h1 className="text-lg font-semibold text-white mb-6">배당 트래킹</h1>

      {/* 입력 폼 */}
      <div className="bg-gray-900 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4">배당 기록 추가</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">종목 *</label>
              <JournalStockPicker
                holdings={holdings}
                value={form.holdingId}
                onChange={(id) => setForm((f) => ({ ...f, holdingId: id }))}
                onNewHolding={(h) => setHoldings((prev) => [...prev, h])}
                listLabel="보유/보유했던 종목"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">배당금 *</label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">지급일 *</label>
              <input
                type="date"
                value={form.paidDate}
                onChange={(e) => setForm((f) => ({ ...f, paidDate: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? '저장 중...' : '배당 기록 추가'}
          </button>
        </form>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-gray-900 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* 기간 토글 */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex items-center gap-1 bg-gray-900 rounded-xl p-1">
              {(Object.keys(PERIOD_LABELS) as DivPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    period === p ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
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

          {/* 요약 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-900 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">전체 배당 합산</p>
              <p className="text-lg font-bold text-yellow-400">
                <span className="private-value">₩{fmt(Math.round(summary.totalCombined))}</span>
              </p>
              {usdKrw > 0 && summary.totalUSD > 0 && (
                <p className="text-xs text-gray-600 mt-0.5">환율 {fmt(usdKrw)}원 기준</p>
              )}
            </div>
            <div className="bg-gray-900 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">원화 배당 (KRW)</p>
              <p className={`text-lg font-bold ${summary.totalKRW > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                <span className="private-value">₩{fmt(Math.round(summary.totalKRW))}</span>
              </p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">달러 배당 (USD)</p>
              <p className={`text-lg font-bold ${summary.totalUSD > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                <span className="private-value">${summary.totalUSD.toFixed(2)}</span>
              </p>
            </div>
          </div>

          {/* 차트 */}
          <div className="bg-gray-900 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-300">배당 추이</h2>
                {usdKrw > 0 && <p className="text-xs text-gray-600 mt-0.5">USD 배당은 현재 환율로 원화 환산</p>}
              </div>
              <div className="flex rounded-lg overflow-hidden border border-gray-700">
                {(['monthly', 'yearly'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setChartView(v)}
                    className={`px-3 py-1 text-xs transition-colors ${
                      chartView === v
                        ? 'bg-yellow-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {v === 'monthly' ? '월별' : '연도별'}
                  </button>
                ))}
              </div>
            </div>
            <DividendChart monthlyData={monthlyData} yearlyData={yearlyData} view={chartView} />
          </div>

          {/* 종목별 배당 요약 */}
          {holdings.filter((h) => holdingDividendMap[h.id]).length > 0 && (
            <div className="bg-gray-900 rounded-xl overflow-hidden mb-6">
              <button
                type="button"
                onClick={() => setSummaryOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-800 hover:bg-gray-800/40 transition-colors"
              >
                <h2 className="text-sm font-semibold text-gray-300">종목별 배당 요약</h2>
                <span className="text-gray-500 text-xs">{summaryOpen ? '▲' : '▼'}</span>
              </button>
              {summaryOpen && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 border-b border-gray-800">
                          <th className="px-4 py-3 text-left">종목</th>
                          <th className="px-4 py-3 text-right">{currentYear}년 배당</th>
                          <th className="px-4 py-3 text-right">누적 배당</th>
                          <th className="px-4 py-3 text-right">Yield on Cost</th>
                          <th className="px-4 py-3 text-right">시가배당률</th>
                        </tr>
                      </thead>
                      <tbody>
                        {holdings
                          .filter((h) => holdingDividendMap[h.id])
                          .sort((a, b) => {
                            const toKrw = (id: string) => {
                              const info = holdingDividendMap[id];
                              if (!info) return 0;
                              return info.currency === 'USD' ? info.total * (usdKrw || 1) : info.total;
                            };
                            return toKrw(b.id) - toKrw(a.id);
                          })
                          .map((h) => {
                            const divInfo = holdingDividendMap[h.id];
                            const currency = divInfo.currency as 'KRW' | 'USD';
                            const annualDiv = divInfo.byYear[currentYear] ?? 0;
                            const costBasis = h.quantity * h.avgPrice;
                            const currentPrice = prices[h.id]?.currentPrice ?? 0;
                            const currentValue = h.quantity * currentPrice;
                            const yieldOnCost = costBasis > 0 ? (annualDiv / costBasis) * 100 : null;
                            const currentYield = currentValue > 0 ? (annualDiv / currentValue) * 100 : null;
                            const fmtAmt = (n: number) =>
                              currency === 'USD' ? `$${n.toFixed(2)}` : `₩${fmt(Math.round(n))}`;
                            return (
                              <tr key={h.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                                <td className="px-4 py-3">
                                  <p className="font-medium text-white">{h.name}</p>
                                  <p className="text-xs text-gray-500">{h.ticker} · {currency}</p>
                                </td>
                                <td className="px-4 py-3 text-right text-yellow-400">
                                  <span className="private-value">{fmtAmt(annualDiv)}</span>
                                </td>
                                <td className="px-4 py-3 text-right text-gray-300">
                                  <span className="private-value">{fmtAmt(divInfo.total)}</span>
                                </td>
                                <td className="px-4 py-3 text-right text-green-400">
                                  {yieldOnCost != null ? `${yieldOnCost.toFixed(2)}%` : (
                                    <span className="text-gray-600 text-xs">미보유</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right text-blue-400">
                                  {currentYield != null ? `${currentYield.toFixed(2)}%` : (
                                    <span className="text-gray-600 text-xs">시세 없음</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2 border-t border-gray-800 text-xs text-gray-600">
                    Yield on Cost: {currentYear}년 배당 ÷ 매입원가 · 시가배당률: {currentYear}년 배당 ÷ 현재 평가금액
                  </div>
                </>
              )}
            </div>
          )}

          {/* 배당 기록 목록 */}
          {(() => {
            const totalPages = Math.ceil(sortedDivs.length / PAGE_SIZE);
            const paginated = sortedDivs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
            return (
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setRecordsOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-800 hover:bg-gray-800/40 transition-colors"
                >
                  <h2 className="text-sm font-semibold text-gray-300">
                    배당 기록{' '}
                    <span className="text-xs font-normal text-gray-600">
                      {PERIOD_LABELS[period]} · {sortedDivs.length}건
                    </span>
                  </h2>
                  <span className="text-gray-500 text-xs">{recordsOpen ? '▲' : '▼'}</span>
                </button>
                {recordsOpen && (
                  <>
                    {sortedDivs.length === 0 ? (
                      <div className="px-4 py-12 text-center text-gray-600 text-sm">
                        {period === 'all' ? '배당 기록이 없습니다.' : `${PERIOD_LABELS[period]} 배당 기록이 없습니다.`}
                      </div>
                    ) : (
                      <>
                        <div className="divide-y divide-gray-800">
                          {paginated.map((div) => {
                            const holding = holdings.find((h) => h.id === div.holdingId);
                            const currency = getDivCurrency(div);
                            const amtStr = currency === 'USD'
                              ? `$${div.amount.toFixed(2)}`
                              : `₩${fmt(div.amount)}`;
                            const isEditing = editingDivId === div.id;
                            return (
                              <div key={div.id} className="px-4 py-3 hover:bg-gray-800/40 transition-colors">
                                {isEditing ? (
                                  <div className="flex items-center gap-3 flex-wrap">
                                    <span className="font-medium text-white text-sm shrink-0">
                                      {holding?.name ?? div.holdingId}
                                    </span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="any"
                                      value={editDivForm.amount}
                                      onChange={(e) => setEditDivForm((f) => ({ ...f, amount: e.target.value }))}
                                      className="w-28 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                                    />
                                    <input
                                      type="date"
                                      value={editDivForm.paidDate}
                                      onChange={(e) => setEditDivForm((f) => ({ ...f, paidDate: e.target.value }))}
                                      className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                                    />
                                    <button
                                      onClick={handleUpdateDiv}
                                      className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
                                    >
                                      저장
                                    </button>
                                    <button
                                      onClick={() => setEditingDivId(null)}
                                      className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
                                    >
                                      취소
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <span className="font-medium text-white text-sm">
                                        {holding?.name ?? div.holdingId}
                                      </span>
                                      <span className="text-xs text-gray-500 ml-2">{holding?.ticker}</span>
                                      <p className="text-xs text-gray-500 mt-0.5">{fmtDate(div.paidDate)}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-yellow-400 font-medium text-sm private-value">
                                        {amtStr}
                                      </span>
                                      <button
                                        onClick={() => handleEditDiv(div)}
                                        className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
                                      >
                                        수정
                                      </button>
                                      <button
                                        onClick={() => handleDelete(div.id)}
                                        className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
                                      >
                                        삭제
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {totalPages > 1 && (
                          <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-gray-800">
                            <button
                              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                              disabled={currentPage === 1}
                              className="px-3 py-1.5 text-xs text-gray-400 bg-gray-800 rounded-lg hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                                    <span key={`e-${idx}`} className="text-xs text-gray-600 px-1">…</span>
                                  ) : (
                                    <button
                                      key={p}
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
                              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                              disabled={currentPage === totalPages}
                              className="px-3 py-1.5 text-xs text-gray-400 bg-gray-800 rounded-lg hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              다음
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
