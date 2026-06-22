'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Holding, Account } from '@/types';
import type { StockSuggestion } from '@/app/api/search/route';
import AccountPicker from './AccountPicker';

type HoldingFormData = {
  ticker: string;
  name: string;
  market: 'KR' | 'US';
  currency: 'KRW' | 'USD';
  quantity: string;
  avgPrice: string;
  targetWeight: string;
  accountId: string | null;
  sector: string;
};

const empty = (): HoldingFormData => ({
  ticker: '',
  name: '',
  market: 'KR',
  currency: 'KRW',
  quantity: '',
  avgPrice: '',
  targetWeight: '',
  accountId: null,
  sector: '',
});

interface Props {
  editing?: Holding | null;
  onDone?: () => void;
  initialAccounts?: Account[];
}

export default function HoldingForm({ editing, onDone, initialAccounts = [] }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<HoldingFormData>(empty());
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [sectors, setSectors] = useState<string[]>([]);
  const [showSectorDrop, setShowSectorDrop] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [stockSelected, setStockSelected] = useState(!!editing);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 계좌 목록이 아직 없으면 fetch
  useEffect(() => {
    if (initialAccounts.length === 0) {
      fetch('/api/accounts')
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setAccounts(data); })
        .catch(() => {});
    }
  }, [initialAccounts.length]);

  // 기존 섹터 목록 fetch
  useEffect(() => {
    fetch('/api/holdings')
      .then((r) => r.json())
      .then((data: { sector?: string | null }[]) => {
        if (!Array.isArray(data)) return;
        const unique = [...new Set(data.map((h) => h.sector).filter(Boolean) as string[])].sort();
        setSectors(unique);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (editing) {
      setForm({
        ticker: editing.ticker,
        name: editing.name,
        market: editing.market,
        currency: editing.currency,
        quantity: String(editing.quantity),
        avgPrice: String(editing.avgPrice),
        targetWeight: editing.targetWeight != null ? String(editing.targetWeight) : '',
        accountId: editing.accountId,
        sector: editing.sector ?? '',
      });
      setQuery(editing.name);
      setStockSelected(true);
    } else {
      setForm(empty());
      setQuery('');
      setStockSelected(false);
    }
  }, [editing]);

  const searchStock = useCallback(async (q: string) => {
    if (q.length < 1) { setSuggestions([]); return; }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setSuggestions(await res.json());
    } catch { setSuggestions([]); }
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setShowSuggestions(true);
    setStockSelected(false);
    setForm((f) => ({ ...f, ticker: value, name: value }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchStock(value), 250);
  };

  const selectSuggestion = (s: StockSuggestion) => {
    setQuery(s.name);
    setForm((f) => ({
      ...f,
      ticker: s.ticker,
      name: s.name,
      market: s.market,
      currency: s.currency,
    }));
    setSuggestions([]);
    setShowSuggestions(false);
    setStockSelected(true);
  };

  const handleMarketChange = (market: 'KR' | 'US') => {
    setForm((f) => ({
      ...f,
      market,
      currency: market === 'KR' ? 'KRW' : 'USD',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ticker || !form.name || !form.quantity || !form.avgPrice) {
      setError('종목, 수량, 매입가는 필수입니다.');
      return;
    }
    if (parseFloat(form.quantity) <= 0) {
      setError('수량은 0보다 커야 합니다.');
      return;
    }
    if (parseFloat(form.avgPrice) <= 0) {
      setError('매입가는 0보다 커야 합니다.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const body = {
        ticker: form.ticker.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
        name: form.name.trim(),
        market: form.market,
        currency: form.currency,
        quantity: parseFloat(form.quantity),
        avgPrice: parseFloat(form.avgPrice),
        targetWeight: form.targetWeight ? parseFloat(form.targetWeight) : null,
        accountId: form.accountId,
        sector: form.sector.trim() || null,
      };

      const url = editing ? `/api/holdings/${editing.id}` : '/api/holdings';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '저장 실패');
      }
      setForm(empty());
      setQuery('');
      router.refresh();
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 종목 검색 */}
      <div className="relative">
        <label className="block text-xs text-gray-500 mb-1">
          종목명 / 티커 *{' '}
          <span className="text-gray-600">
            (국내: 종목명으로 검색, 해외: NVDA·AAPL 등 직접 입력)
          </span>
        </label>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => query && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder="삼성전자 또는 NVDA"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          autoComplete="off"
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute z-20 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl">
            {suggestions.map((s) => (
              <li
                key={s.ticker}
                onMouseDown={() => selectSuggestion(s)}
                className="flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-700 cursor-pointer"
              >
                <span className="text-white">{s.name}</span>
                <span className="text-gray-400 text-xs ml-3">
                  {s.ticker} · {s.market === 'KR' ? '국내' : '해외'} ·{' '}
                  {s.currency}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 시장 + 종목코드 (선택 후 표시) */}
      <div className={stockSelected ? 'grid grid-cols-2 gap-3' : ''}>
        {stockSelected && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">종목코드 / 티커</label>
            <input
              type="text"
              value={form.ticker}
              onChange={(e) => {
                const val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                setForm((f) => ({ ...f, ticker: val }));
              }}
              placeholder="005930 또는 NVDA"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">시장</label>
          <div className="flex rounded-lg overflow-hidden border border-gray-700 h-[38px]">
            {(['KR', 'US'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleMarketChange(m)}
                className={`flex-1 text-sm font-medium transition-colors ${
                  form.market === m
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {m === 'KR' ? '🇰🇷 국내' : '🇺🇸 해외'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 통화 표시 (자동) */}
      <div className="text-xs text-gray-500">
        통화:{' '}
        <span className="text-blue-400 font-medium">
          {form.currency} (시장 선택에 따라 자동 설정)
        </span>
      </div>

      {/* 수량 + 매입가 */}
      <div className="grid grid-cols-2 gap-3">
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
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            평균 매입가 ({form.currency === 'USD' ? '$' : '₩'}) *
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={form.avgPrice}
            onChange={(e) => setForm((f) => ({ ...f, avgPrice: e.target.value }))}
            placeholder="0"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* 계좌 선택 */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">계좌 (선택)</label>
        <AccountPicker
          accounts={accounts}
          value={form.accountId}
          onChange={(id) => setForm((f) => ({ ...f, accountId: id }))}
          onAccountCreated={(acc) => setAccounts((prev) => [...prev, acc])}
          onAccountDeleted={(id) => setAccounts((prev) => prev.filter((a) => a.id !== id))}
        />
      </div>

      {/* 목표 비중 */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">
          목표 비중 % (선택)
        </label>
        <input
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={form.targetWeight}
          onChange={(e) => setForm((f) => ({ ...f, targetWeight: e.target.value }))}
          placeholder="예: 30"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* 섹터 / 테마 */}
      <div className="relative">
        <label className="block text-xs text-gray-500 mb-1">
          섹터 / 테마 <span className="text-gray-600">(선택)</span>
        </label>
        <input
          type="text"
          value={form.sector}
          onChange={(e) => { setForm((f) => ({ ...f, sector: e.target.value })); setShowSectorDrop(true); }}
          onFocus={() => setShowSectorDrop(true)}
          onBlur={() => setTimeout(() => setShowSectorDrop(false), 150)}
          placeholder="예: 반도체, AI, 배당ETF, 금융"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          autoComplete="off"
        />
        {showSectorDrop && sectors.filter((s) =>
          !form.sector.trim() || s.toLowerCase().includes(form.sector.toLowerCase())
        ).length > 0 && (
          <ul className="absolute z-20 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl max-h-40 overflow-y-auto">
            {sectors
              .filter((s) => !form.sector.trim() || s.toLowerCase().includes(form.sector.toLowerCase()))
              .map((s) => (
                <li
                  key={s}
                  onMouseDown={() => { setForm((f) => ({ ...f, sector: s })); setShowSectorDrop(false); }}
                  className="px-3 py-2 text-sm text-white hover:bg-gray-700 cursor-pointer"
                >
                  {s}
                </li>
              ))}
          </ul>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {submitting ? '저장 중...' : editing ? '수정 완료' : '종목 추가'}
        </button>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            취소
          </button>
        )}
      </div>
    </form>
  );
}
