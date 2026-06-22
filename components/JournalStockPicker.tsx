'use client';

import { useState, useRef, useCallback } from 'react';
import type { Holding } from '@/types';
import type { StockSuggestion } from '@/app/api/search/route';

interface Props {
  holdings: Holding[];
  value: string;
  onChange: (id: string) => void;
  onNewHolding?: (holding: Holding) => void;
  placeholder?: string;
}

export default function JournalStockPicker({
  holdings,
  value,
  onChange,
  onNewHolding,
  placeholder = '종목명 또는 티커 입력',
}: Props) {
  const selected = holdings.find((h) => h.id === value) ?? null;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchStock = useCallback(async (q: string) => {
    if (q.length < 1) { setSuggestions([]); return; }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setSuggestions(await res.json());
      else setSuggestions([]);
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
    : holdings;

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
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
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
        onBlur={() => setTimeout(() => setOpen(false), 150)}
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
                  보유 종목
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
        <div className="absolute z-20 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-500">
          검색 결과 없음
        </div>
      )}
    </div>
  );
}
