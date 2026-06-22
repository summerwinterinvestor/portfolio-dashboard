'use client';

import { useState, useRef, useCallback } from 'react';
import type { Holding } from '@/types';
import type { StockSuggestion } from '@/app/api/search/route';

interface Props {
  holdings: Holding[];          // 전체 holdings (선택 후 표시용)
  recentHoldings?: Holding[];   // 드롭다운에 보여줄 목록 (매매 이력 종목)
  value: string;
  onChange: (id: string) => void;
  onNewHolding?: (holding: Holding) => void;
  placeholder?: string;
  listLabel?: string;           // 드롭다운 섹션 헤더 라벨
}

type ManualForm = { name: string; market: 'KR' | 'US' };

export default function JournalStockPicker({
  holdings,
  recentHoldings,
  value,
  onChange,
  onNewHolding,
  placeholder = '종목명 또는 티커 입력',
  listLabel = '매매 이력',
}: Props) {
  const selected = holdings.find((h) => h.id === value) ?? null;
  const listSource = recentHoldings ?? holdings;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
  const [creating, setCreating] = useState(false);
  const [manualForm, setManualForm] = useState<ManualForm | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualFormRef = useRef<ManualForm | null>(null);
  manualFormRef.current = manualForm;

  const searchStock = useCallback(async (q: string) => {
    if (q.length < 1) { setSuggestions([]); return; }
    try {
      // 브라우저에서 직접 호출 (서버사이드는 Naver가 쿠키 없어서 빈 응답 반환)
      const res = await fetch(
        `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock`,
        { headers: { Referer: 'https://finance.naver.com/' } }
      );
      if (!res.ok) { setSuggestions([]); return; }
      const data = await res.json();
      const items: Array<{ code: string; name: string; nationCode: string }> = data?.items ?? [];
      const suggestions = items
        .filter((i) => i.nationCode === 'KOR' || i.nationCode === 'USA')
        .slice(0, 8)
        .map((i) => ({
          ticker: i.code,
          name: i.name,
          market: (i.nationCode === 'KOR' ? 'KR' : 'US') as 'KR' | 'US',
          currency: (i.nationCode === 'KOR' ? 'KRW' : 'USD') as 'KRW' | 'USD',
        }))
        .filter((s) => s.ticker && s.name);
      setSuggestions(suggestions);
    } catch { setSuggestions([]); }
  }, []);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchStock(val), 250);
  };

  const filteredHoldings = query.trim()
    ? holdings.filter(
        (h) =>
          h.name.toLowerCase().includes(query.toLowerCase()) ||
          h.ticker.toLowerCase().includes(query.toLowerCase())
      )
    : listSource;

  const newSuggestions = suggestions.filter(
    (s) => !holdings.some((h) => h.ticker === s.ticker)
  );

  const hasResults = filteredHoldings.length > 0 || newSuggestions.length > 0;

  const handleSelectHolding = (h: Holding) => {
    onChange(h.id);
    setQuery('');
    setSuggestions([]);
    setOpen(false);
  };

  const handleSelectSuggestion = async (s: StockSuggestion) => {
    setOpen(false);
    setCreating(true);
    try {
      const res = await fetch('/api/holdings/find-or-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: s.ticker, name: s.name, market: s.market, currency: s.currency }),
      });
      if (res.ok) {
        const holding: Holding = await res.json();
        onNewHolding?.(holding);
        onChange(holding.id);
        setQuery('');
        setSuggestions([]);
      }
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
    setSuggestions([]);
    setManualForm(null);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleManualAdd = async () => {
    if (!manualForm || !query.trim()) return;
    const ticker = query.trim().toUpperCase();
    const currency = manualForm.market === 'US' ? 'USD' : 'KRW';
    setOpen(false);
    setCreating(true);
    try {
      const res = await fetch('/api/holdings/find-or-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          name: manualForm.name.trim() || ticker,
          market: manualForm.market,
          currency,
        }),
      });
      if (res.ok) {
        const holding: Holding = await res.json();
        onNewHolding?.(holding);
        onChange(holding.id);
        setQuery('');
        setSuggestions([]);
        setManualForm(null);
      }
    } catch { /* ignore */ } finally {
      setCreating(false);
    }
  };

  if (selected && !open) {
    return (
      <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
        <span className="flex-1 text-sm text-white">{selected.name}</span>
        <span className="text-xs text-gray-500">{selected.ticker} · {selected.currency}</span>
        <button
          type="button"
          onClick={handleClear}
          className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
        >
          변경
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { if (!manualFormRef.current) setOpen(false); }, 150)}
        placeholder={creating ? '종목 등록 중...' : placeholder}
        disabled={creating}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
        autoComplete="off"
      />
      {open && hasResults && (
        <ul className="absolute z-20 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl max-h-64 overflow-y-auto">
          {filteredHoldings.length > 0 && (
            <>
              {(query || newSuggestions.length > 0) && (
                <li className="px-3 py-1 text-xs text-gray-600 bg-gray-850 border-b border-gray-700">
                  {listLabel}
                </li>
              )}
              {filteredHoldings.map((h) => (
                <li
                  key={h.id}
                  onMouseDown={() => handleSelectHolding(h)}
                  className="flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-700 cursor-pointer"
                >
                  <span className="text-white">{h.name}</span>
                  <span className="text-gray-400 text-xs ml-3">
                    {h.ticker} · {h.market === 'KR' ? '국내' : '해외'} · {h.currency}
                  </span>
                </li>
              ))}
            </>
          )}
          {newSuggestions.length > 0 && (
            <>
              <li className="px-3 py-1 text-xs text-gray-600 bg-gray-850 border-b border-gray-700 border-t border-gray-700">
                종목 검색 결과
              </li>
              {newSuggestions.map((s) => (
                <li
                  key={s.ticker}
                  onMouseDown={() => handleSelectSuggestion(s)}
                  className="flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-700 cursor-pointer"
                >
                  <span className="text-white">{s.name}</span>
                  <span className="text-xs ml-3 flex items-center gap-1.5">
                    <span className="text-gray-400">{s.ticker} · {s.market === 'KR' ? '국내' : '해외'} · {s.currency}</span>
                    <span className="text-blue-400">+추가</span>
                  </span>
                </li>
              ))}
            </>
          )}
        </ul>
      )}
      {open && query && !hasResults && (
        <div className="absolute z-20 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl">
          {!manualForm ? (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setManualForm({ name: '', market: 'US' }); }}
              className="w-full px-3 py-2.5 text-sm text-left hover:bg-gray-700 transition-colors flex items-center justify-between"
            >
              <span className="text-gray-300">
                <span className="text-white font-medium">{query.toUpperCase()}</span> 직접 추가
              </span>
              <span className="text-blue-400 text-xs">+추가</span>
            </button>
          ) : (
            <div className="p-3 space-y-2">
              <p className="text-xs text-gray-500 mb-1">
                <span className="text-white font-medium">{query.toUpperCase()}</span> 직접 추가
              </p>
              <input
                type="text"
                placeholder="종목명 (예: Alphabet Inc.)"
                value={manualForm.name}
                onChange={(e) => setManualForm((f) => f ? { ...f, name: e.target.value } : f)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <div className="flex gap-2">
                <select
                  value={manualForm.market}
                  onChange={(e) => setManualForm((f) => f ? { ...f, market: e.target.value as 'KR' | 'US' } : f)}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="US">미국 (USD)</option>
                  <option value="KR">국내 (KRW)</option>
                </select>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleManualAdd(); }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                >
                  추가
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setManualForm(null); }}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
