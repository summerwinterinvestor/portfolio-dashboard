'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Dividend, Holding, PriceData } from '@/types';
import DividendChart from '@/components/DividendChart';
import HoldingPicker from '@/components/HoldingPicker';

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

export default function DividendsPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [loading, setLoading] = useState(true);
  const [chartView, setChartView] = useState<'monthly' | 'yearly'>('monthly');
  const [form, setForm] = useState<DivForm>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, dRes] = await Promise.all([
        fetch('/api/holdings'),
        fetch('/api/dividends'),
      ]);
      const holdingsData: Holding[] = hRes.ok ? await hRes.json() : [];
      const dividendsData: Dividend[] = dRes.ok ? await dRes.json() : [];
      setHoldings(holdingsData);
      setDividends(dividendsData);

      // 현재가 조회 (yield 계산용)
      const priceMap: Record<string, PriceData> = {};
      await Promise.all(
        holdingsData.map(async (h) => {
          try {
            const params = new URLSearchParams({ ticker: h.ticker, market: h.market });
            if (h.market === 'US') params.set('exchange', h.exchange ?? 'NAS');
            const res = await fetch(`/api/kis/price?${params}`);
            if (res.ok) {
              priceMap[h.id] = await res.json();
            }
          } catch {
            // ignore
          }
        })
      );
      setPrices(priceMap);
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

  // 종목별 연간 배당금 집계
  const holdingDividendMap: Record<
    string,
    { total: number; byYear: Record<string, number> }
  > = {};
  for (const div of dividends) {
    if (!holdingDividendMap[div.holdingId]) {
      holdingDividendMap[div.holdingId] = { total: 0, byYear: {} };
    }
    const year = new Date(div.paidDate).getFullYear().toString();
    holdingDividendMap[div.holdingId].total += div.amount;
    holdingDividendMap[div.holdingId].byYear[year] =
      (holdingDividendMap[div.holdingId].byYear[year] ?? 0) + div.amount;
  }

  // 월별 집계 (전체)
  const monthlyMap: Record<string, number> = {};
  for (const div of dividends) {
    const key = div.paidDate.slice(0, 7); // "2025-06"
    monthlyMap[key] = (monthlyMap[key] ?? 0) + div.amount;
  }
  const monthlyData = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, amount]) => ({ label, amount }));

  // 연도별 집계 (전체)
  const yearlyMap: Record<string, number> = {};
  for (const div of dividends) {
    const key = new Date(div.paidDate).getFullYear().toString();
    yearlyMap[key] = (yearlyMap[key] ?? 0) + div.amount;
  }
  const yearlyData = Object.entries(yearlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, amount]) => ({ label, amount }));

  const totalDividend = dividends.reduce((s, d) => s + d.amount, 0);

  const currentYear = new Date().getFullYear().toString();

  const sortedDivs = [...dividends].sort(
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
              <HoldingPicker
                holdings={holdings}
                value={form.holdingId}
                onChange={(id) => setForm((f) => ({ ...f, holdingId: id }))}
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
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-900 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">전체 누적 배당</p>
              <p className="text-lg font-bold text-yellow-400">
                <span className="private-value">₩{fmt(Math.round(totalDividend))}</span>
              </p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">{currentYear}년 배당</p>
              <p className="text-lg font-bold text-yellow-400">
                <span className="private-value">₩{fmt(Math.round(yearlyMap[currentYear] ?? 0))}</span>
              </p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">배당 횟수</p>
              <p className="text-lg font-bold text-white">{dividends.length}건</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">배당 종목 수</p>
              <p className="text-lg font-bold text-white">
                {Object.keys(holdingDividendMap).length}개
              </p>
            </div>
          </div>

          {/* 차트 */}
          <div className="bg-gray-900 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-300">배당 추이</h2>
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
            <DividendChart
              monthlyData={monthlyData}
              yearlyData={yearlyData}
              view={chartView}
            />
          </div>

          {/* 종목별 배당 요약 테이블 */}
          {holdings.filter((h) => holdingDividendMap[h.id]).length > 0 && (
            <div className="bg-gray-900 rounded-xl overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-gray-800">
                <h2 className="text-sm font-semibold text-gray-300">
                  종목별 배당 요약
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-800">
                      <th className="px-4 py-3 text-left">종목</th>
                      <th className="px-4 py-3 text-right">
                        {currentYear}년 배당
                      </th>
                      <th className="px-4 py-3 text-right">누적 배당</th>
                      <th className="px-4 py-3 text-right">
                        Yield on Cost
                      </th>
                      <th className="px-4 py-3 text-right">시가배당률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings
                      .filter((h) => holdingDividendMap[h.id])
                      .map((h) => {
                        const divInfo = holdingDividendMap[h.id];
                        const annualDiv = divInfo.byYear[currentYear] ?? 0;
                        const costBasis = h.quantity * h.avgPrice;
                        const yieldOnCost =
                          costBasis > 0
                            ? (annualDiv / costBasis) * 100
                            : 0;
                        const currentPrice =
                          prices[h.id]?.currentPrice ?? h.avgPrice;
                        const currentValue = h.quantity * currentPrice;
                        const currentYield =
                          currentValue > 0
                            ? (annualDiv / currentValue) * 100
                            : 0;
                        return (
                          <tr
                            key={h.id}
                            className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40"
                          >
                            <td className="px-4 py-3">
                              <p className="font-medium text-white">
                                {h.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {h.ticker}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-right text-yellow-400">
                              <span className="private-value">₩{fmt(Math.round(annualDiv))}</span>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-300">
                              <span className="private-value">₩{fmt(Math.round(divInfo.total))}</span>
                            </td>
                            <td className="px-4 py-3 text-right text-green-400">
                              {yieldOnCost.toFixed(2)}%
                            </td>
                            <td className="px-4 py-3 text-right text-blue-400">
                              {currentYield.toFixed(2)}%
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t border-gray-800 text-xs text-gray-600">
                Yield on Cost: {currentYear}년 배당 / 매입원가 · 시가배당률: {currentYear}년 배당 / 현재가 기준 평가금액
              </div>
            </div>
          )}

          {/* 배당 기록 목록 */}
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-gray-300">
                배당 기록 ({dividends.length}건)
              </h2>
            </div>
            {sortedDivs.length === 0 ? (
              <div className="px-4 py-12 text-center text-gray-600 text-sm">
                배당 기록이 없습니다.
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {sortedDivs.map((div) => {
                  const holding = holdings.find((h) => h.id === div.holdingId);
                  return (
                    <div
                      key={div.id}
                      className="px-4 py-3 flex items-center justify-between hover:bg-gray-800/40 transition-colors"
                    >
                      <div>
                        <span className="font-medium text-white text-sm">
                          {holding?.name ?? div.holdingId}
                        </span>
                        <span className="text-xs text-gray-500 ml-2">
                          {holding?.ticker}
                        </span>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {fmtDate(div.paidDate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-yellow-400 font-medium text-sm private-value">
                          ₩{fmt(div.amount)}
                        </span>
                        <button
                          onClick={() => handleDelete(div.id)}
                          className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
