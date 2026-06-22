'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Holding } from '@/types';

// ── CSV 파싱 ────────────────────────────────────────────────────────

type ParsedTrade = {
  date: string;
  type: 'BUY' | 'SELL';
  stockName: string;
  quantity: number;
  price: number;
  fee: number | null;
  currency: 'KRW' | 'USD';
};

const IMPORT_TYPES = new Set([
  '해외증권매수 USD', '해외증권매도 USD',
  'Smart+거래소주식매수', 'Smart+거래소주식매도',
  'Smart+코스닥주식매수', 'Smart+코스닥주식매도',
]);

function parseKisCSV(content: string): ParsedTrade[] {
  const lines = content.split('\n');
  const trades: ParsedTrade[] = [];

  let i = 0;
  while (i < lines.length && !lines[i].startsWith('거래일')) i++;
  i += 2;

  while (i < lines.length - 1) {
    const c1 = lines[i].split(',');
    const c2 = (lines[i + 1] ?? '').split(',');
    const tradeType = (c1[1] ?? '').trim();

    if (IMPORT_TYPES.has(tradeType)) {
      const isUSD = tradeType.includes('USD');
      const isBuy = tradeType.includes('매수');
      const date = c1[0].trim().replace(/\./g, '-');
      const quantity = parseFloat(c1[4]?.trim() || '0');
      const price = parseFloat(c2[4]?.trim() || '0');
      const feeVal = parseFloat(c1[7]?.trim() || '0');

      if (quantity > 0 && price > 0) {
        trades.push({
          date,
          type: isBuy ? 'BUY' : 'SELL',
          stockName: c1[2].trim(),
          quantity,
          price,
          fee: feeVal > 0 ? feeVal : null,
          currency: isUSD ? 'USD' : 'KRW',
        });
      }
    }
    i += 2;
  }
  return trades;
}

// ── 타입 ────────────────────────────────────────────────────────────

type MappingValue =
  | { kind: 'existing'; holdingId: string }
  | { kind: 'new'; ticker: string; market: 'KR' | 'US'; currency: 'KRW' | 'USD'; name: string };

type Step = 'upload' | 'mapping' | 'preview' | 'done';

function fmt(n: number) {
  return n.toLocaleString('ko-KR');
}

// ── 메인 ────────────────────────────────────────────────────────────

export default function ImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [parsed, setParsed] = useState<ParsedTrade[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [mapping, setMapping] = useState<Record<string, MappingValue>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/holdings').then((r) => r.json()).then(setHoldings).catch(() => {});
  }, []);

  // ── 파일 업로드 ──────────────────────────────────────────────────

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const trades = parseKisCSV(content);
      if (trades.length === 0) {
        setError('매매내역을 찾을 수 없습니다. 한국투자증권 전체거래내역 CSV인지 확인해주세요.');
        return;
      }
      setParsed(trades);

      const uniqueNames = [...new Set(trades.map((t) => t.stockName))];
      const initMapping: Record<string, MappingValue> = {};

      for (const name of uniqueNames) {
        // 이름 완전 일치 시 자동 연결
        const match = holdings.find(
          (h) => h.name.toLowerCase() === name.toLowerCase()
        );
        if (match) {
          initMapping[name] = { kind: 'existing', holdingId: match.id };
        } else {
          // 기본값: 기존 종목 선택 (드롭다운) — 보유종목이 이미 등록된 경우
          initMapping[name] = { kind: 'existing', holdingId: '' };
        }
      }

      setMapping(initMapping);
      setSelected(new Set(trades.map((_, i) => i)));
      setStep('mapping');
      setError('');
    };
    reader.readAsText(file, 'utf-8');
  }

  // ── 매핑 완료 → 미리보기 ────────────────────────────────────────

  function handleMappingNext() {
    setError('');
    const unlinked: string[] = [];
    for (const [name, val] of Object.entries(mapping)) {
      if (val.kind === 'existing' && !val.holdingId) unlinked.push(name);
      if (val.kind === 'new' && !val.ticker.trim()) unlinked.push(name);
    }
    if (unlinked.length > 0) {
      setError(`연결되지 않은 종목: ${unlinked.join(', ')}`);
      return;
    }
    setStep('preview');
  }

  // ── 가져오기 실행 ────────────────────────────────────────────────

  async function handleImport() {
    setImporting(true);
    setError('');
    try {
      const holdingIdMap: Record<string, string> = {};
      for (const [name, val] of Object.entries(mapping)) {
        if (val.kind === 'existing') {
          holdingIdMap[name] = val.holdingId;
        } else {
          const res = await fetch('/api/holdings/find-or-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticker: val.ticker.toUpperCase(),
              name: val.name,
              market: val.market,
              currency: val.currency,
            }),
          });
          if (!res.ok) throw new Error(`${name} 종목 생성 실패`);
          const h = await res.json();
          holdingIdMap[name] = h.id;
        }
      }

      const tradesToImport = parsed
        .filter((_, i) => selected.has(i))
        .map((t) => ({
          holdingId: holdingIdMap[t.stockName],
          type: t.type,
          quantity: t.quantity,
          price: t.price,
          tradeDate: t.date,
          fee: t.fee,
        }));

      const res = await fetch('/api/trades/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tradesToImport),
      });
      if (!res.ok) throw new Error('가져오기 실패');
      const { imported, skipped } = await res.json();
      setImportedCount(imported);
      setSkippedCount(skipped ?? 0);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setImporting(false);
    }
  }

  // ── 렌더 ─────────────────────────────────────────────────────────

  const uniqueNames = [...new Set(parsed.map((t) => t.stockName))];

  const resolvedName = (stockName: string): string => {
    const val = mapping[stockName];
    if (!val) return stockName;
    if (val.kind === 'existing') {
      return holdings.find((h) => h.id === val.holdingId)?.name ?? stockName;
    }
    return val.ticker ? `${val.name} (${val.ticker})` : stockName;
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="text-gray-500 hover:text-gray-300 text-sm"
        >
          ← 뒤로
        </button>
        <h1 className="text-lg font-semibold text-white">CSV 매매내역 가져오기</h1>
      </div>

      {/* 진행 단계 */}
      <div className="flex items-center gap-2 mb-8 text-xs">
        {(['upload', 'mapping', 'preview', 'done'] as Step[]).map((s, idx) => {
          const labels: Record<Step, string> = {
            upload: '파일 선택', mapping: '종목 연결', preview: '미리보기', done: '완료',
          };
          const stepOrder = ['upload', 'mapping', 'preview', 'done'];
          const isActive = s === step;
          const isDone = stepOrder.indexOf(s) < stepOrder.indexOf(step);
          return (
            <div key={s} className="flex items-center gap-2">
              {idx > 0 && <span className="text-gray-700">—</span>}
              <span className={`px-2 py-0.5 rounded ${
                isActive ? 'text-white bg-blue-600' : isDone ? 'text-green-400' : 'text-gray-600'
              }`}>
                {labels[s]}
              </span>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ── Step 1: 업로드 ── */}
      {step === 'upload' && (
        <div
          className="border-2 border-dashed border-gray-700 rounded-xl p-12 text-center cursor-pointer hover:border-gray-500 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          <p className="text-gray-300 font-medium mb-1">CSV 파일을 여기에 끌어다 놓거나 클릭하세요</p>
          <p className="text-xs text-gray-600">한국투자증권 → 거래내역 → 전체거래내역 CSV</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      )}

      {/* ── Step 2: 종목 연결 ── */}
      {step === 'mapping' && (
        <div className="space-y-6">
          <p className="text-sm text-gray-400">
            총 <span className="text-white font-medium">{parsed.length}건</span> 매매내역,{' '}
            <span className="text-white font-medium">{uniqueNames.length}개</span> 종목 발견.
            각 CSV 종목명을 앱의 보유종목에 연결하세요.
          </p>

          <div className="space-y-3">
            {uniqueNames.map((name) => {
              const val = mapping[name];
              const exampleTrade = parsed.find((t) => t.stockName === name);
              const count = parsed.filter((t) => t.stockName === name).length;

              return (
                <div key={name} className="bg-gray-900 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div>
                      <p className="text-sm font-medium text-white">{name}</p>
                      <p className="text-xs text-gray-500">{exampleTrade?.currency} · {count}건</p>
                    </div>
                    <div className="flex rounded-lg overflow-hidden border border-gray-700 shrink-0 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          setMapping((m) => ({ ...m, [name]: { kind: 'existing', holdingId: '' } }))
                        }
                        className={`px-3 py-1.5 font-medium transition-colors ${
                          val?.kind === 'existing'
                            ? 'bg-gray-700 text-white'
                            : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        기존 종목
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMapping((m) => ({
                            ...m,
                            [name]: {
                              kind: 'new',
                              ticker: '',
                              market: exampleTrade?.currency === 'USD' ? 'US' : 'KR',
                              currency: exampleTrade?.currency ?? 'KRW',
                              name,
                            },
                          }))
                        }
                        className={`px-3 py-1.5 font-medium transition-colors ${
                          val?.kind === 'new'
                            ? 'bg-gray-700 text-white'
                            : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        새로 추가
                      </button>
                    </div>
                  </div>

                  {/* 기존 종목 드롭다운 */}
                  {val?.kind === 'existing' && (
                    <select
                      value={val.holdingId}
                      onChange={(e) =>
                        setMapping((m) => ({
                          ...m,
                          [name]: { kind: 'existing', holdingId: e.target.value },
                        }))
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="">-- 보유종목 선택 --</option>
                      {holdings.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} ({h.ticker}) · {h.currency}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* 새로 추가 입력 */}
                  {val?.kind === 'new' && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="티커 (예: SOXL, 005930)"
                        value={val.ticker}
                        onChange={(e) => {
                          const ticker = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                          setMapping((m) => {
                            const cur = m[name];
                            if (cur.kind !== 'new') return m;
                            return { ...m, [name]: { ...cur, ticker } };
                          });
                        }}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                      />
                      <select
                        value={val.market}
                        onChange={(e) => {
                          const market = e.target.value as 'KR' | 'US';
                          setMapping((m) => {
                            const cur = m[name];
                            if (cur.kind !== 'new') return m;
                            return { ...m, [name]: { ...cur, market, currency: market === 'US' ? 'USD' : 'KRW' } };
                          });
                        }}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="US">미국 (USD)</option>
                        <option value="KR">국내 (KRW)</option>
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleMappingNext}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              다음 →
            </button>
            <button
              onClick={() => { setStep('upload'); setError(''); }}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
            >
              다시 선택
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: 미리보기 ── */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              <span className="text-white font-medium">{selected.size}건</span> 가져오기 예정 —
              체크 해제로 제외 가능
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setSelected(new Set(parsed.map((_, i) => i)))}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                전체 선택
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                전체 해제
              </button>
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="px-3 py-3 w-8"></th>
                  <th className="px-3 py-3 text-left">날짜</th>
                  <th className="px-3 py-3 text-left">종목</th>
                  <th className="px-3 py-3 text-center">구분</th>
                  <th className="px-3 py-3 text-right">수량</th>
                  <th className="px-3 py-3 text-right">단가</th>
                  <th className="px-3 py-3 text-right">수수료</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((t, i) => (
                  <tr
                    key={i}
                    className={`border-b border-gray-800 last:border-0 cursor-pointer transition-opacity ${
                      selected.has(i) ? 'hover:bg-gray-800/40' : 'opacity-30'
                    }`}
                    onClick={() =>
                      setSelected((s) => {
                        const next = new Set(s);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        return next;
                      })
                    }
                  >
                    <td className="px-3 py-2.5 text-center">
                      <input type="checkbox" checked={selected.has(i)} readOnly className="accent-blue-500" />
                    </td>
                    <td className="px-3 py-2.5 text-gray-400 text-xs whitespace-nowrap">{t.date}</td>
                    <td className="px-3 py-2.5 text-white text-xs font-medium">{resolvedName(t.stockName)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        t.type === 'BUY' ? 'bg-blue-600/30 text-blue-400' : 'bg-red-600/30 text-red-400'
                      }`}>
                        {t.type === 'BUY' ? '매수' : '매도'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-300 text-xs">{fmt(t.quantity)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-300 text-xs">
                      {t.currency === 'USD' ? `$${t.price.toFixed(4)}` : `₩${fmt(t.price)}`}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-500 text-xs">
                      {t.fee
                        ? t.currency === 'USD' ? `$${t.fee.toFixed(2)}` : `₩${fmt(t.fee)}`
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={importing || selected.size === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {importing ? '가져오는 중...' : `${selected.size}건 가져오기`}
            </button>
            <button
              onClick={() => setStep('mapping')}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
            >
              ← 종목 연결 수정
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: 완료 ── */}
      {step === 'done' && (
        <div className="bg-gray-900 rounded-xl p-12 text-center">
          <p className="text-3xl mb-3">✓</p>
          <p className="text-white font-semibold text-lg mb-1">{importedCount}건 가져오기 완료</p>
          {skippedCount > 0 && (
            <p className="text-yellow-500 text-sm mb-1">중복 {skippedCount}건 건너뜀</p>
          )}
          <p className="text-gray-500 text-sm mb-6">매매일지에서 확인하세요.</p>
          <button
            onClick={() => router.push('/journal')}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            매매일지로 이동
          </button>
        </div>
      )}
    </div>
  );
}
