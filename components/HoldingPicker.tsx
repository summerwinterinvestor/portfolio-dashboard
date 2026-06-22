'use client';

import { useState, useRef } from 'react';
import type { Holding } from '@/types';

interface Props {
  holdings: Holding[];
  value: string;          // holdingId
  onChange: (id: string) => void;
  placeholder?: string;
}

export default function HoldingPicker({ holdings, value, onChange, placeholder = '종목명 또는 티커 입력' }: Props) {
  const selected = holdings.find((h) => h.id === value) ?? null;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? holdings.filter(
        (h) =>
          h.name.toLowerCase().includes(query.toLowerCase()) ||
          h.ticker.toLowerCase().includes(query.toLowerCase())
      )
    : holdings;

  const handleSelect = (h: Holding) => {
    onChange(h.id);
    setQuery('');
    setOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
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
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={holdings.length === 0 ? '보유 종목 없음 (대시보드에서 먼저 추가)' : placeholder}
        disabled={holdings.length === 0}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl">
          {filtered.map((h) => (
            <li
              key={h.id}
              onMouseDown={() => handleSelect(h)}
              className="flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-700 cursor-pointer"
            >
              <span className="text-white">{h.name}</span>
              <span className="text-gray-400 text-xs ml-3">
                {h.ticker} · {h.market === 'KR' ? '국내' : '해외'} · {h.currency}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && holdings.length > 0 && filtered.length === 0 && (
        <div className="absolute z-20 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-500">
          일치하는 종목 없음
        </div>
      )}
    </div>
  );
}
