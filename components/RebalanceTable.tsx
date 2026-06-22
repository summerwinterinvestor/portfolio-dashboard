"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface RebalanceRow {
  ticker: string;
  name: string;
  market: string;
  currency: "KRW" | "USD";
  currentValueKRW: number;
  currentWeight: number;
  targetWeight: number | null;
  gap: number | null;
  priceOk: boolean;
  currentPrice: number;
}

interface Props {
  rows: RebalanceRow[];
  totalValueKRW: number;
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function fmtPrice(price: number, currency: "KRW" | "USD") {
  if (currency === "USD") return `$${price.toFixed(2)}`;
  return `₩${fmt(Math.round(price))}`;
}

export default function RebalanceTable({ rows, totalValueKRW }: Props) {
  const router = useRouter();
  const [editingTicker, setEditingTicker] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);

  const sortedRows = [...rows].sort((a, b) => {
    const absA = a.gap !== null ? Math.abs(a.gap) : -1;
    const absB = b.gap !== null ? Math.abs(b.gap) : -1;
    return absB - absA;
  });

  if (rows.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl p-12 text-center text-gray-600 text-sm">
        보유 종목이 없습니다.
      </div>
    );
  }

  async function saveTargetWeight(ticker: string) {
    const val = parseFloat(inputValue);
    if (isNaN(val) || val < 0 || val > 100) return;
    setSaving(true);
    try {
      await fetch(`/api/holdings/target-weight`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, targetWeight: val }),
      });
      router.refresh();
    } finally {
      setSaving(false);
      setEditingTicker(null);
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-800">
              <th className="px-4 py-3 text-left">종목</th>
              <th className="px-4 py-3 text-right">현재가</th>
              <th className="px-4 py-3 text-right">평가금액</th>
              <th className="px-4 py-3 text-right">현재 비중</th>
              <th className="px-4 py-3 text-right">목표 비중</th>
              <th className="px-4 py-3 text-center w-52">괴리</th>
              <th className="px-4 py-3 text-right">조정 참고</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const { ticker, name, market, currency, currentValueKRW, currentWeight, targetWeight, gap, priceOk, currentPrice } = row;
              const adjustKRW =
                gap !== null && totalValueKRW > 0
                  ? (gap / 100) * totalValueKRW
                  : null;

              const gapAbs = gap !== null ? Math.abs(gap) : 0;
              const barMax = 20;
              const barWidth = Math.min((gapAbs / barMax) * 100, 100);
              const isEditing = editingTicker === ticker;

              return (
                <tr
                  key={ticker}
                  className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-white">{name}</p>
                      <p className="text-xs text-gray-500">
                        {ticker} · {market}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">
                    <span>{fmtPrice(currentPrice, currency)}</span>
                    {!priceOk && (
                      <p className="text-xs text-yellow-600">매입가 기준</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-white">
                    ₩{fmt(Math.round(currentValueKRW))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">
                    {currentWeight.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveTargetWeight(ticker);
                            if (e.key === "Escape") setEditingTicker(null);
                          }}
                          className="w-16 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-right text-xs text-white focus:outline-none focus:border-blue-500"
                          autoFocus
                        />
                        <span className="text-gray-500 text-xs">%</span>
                        <button
                          onClick={() => saveTargetWeight(ticker)}
                          disabled={saving}
                          className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => setEditingTicker(null)}
                          className="text-xs text-gray-500 hover:text-gray-400"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingTicker(ticker);
                          setInputValue(targetWeight !== null ? String(targetWeight) : "");
                        }}
                        className="text-gray-300 hover:text-white text-right w-full group"
                      >
                        {targetWeight !== null ? (
                          <span>{targetWeight}%</span>
                        ) : (
                          <span className="text-gray-600 group-hover:text-gray-400">-</span>
                        )}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {gap !== null ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 flex justify-end">
                          {gap < 0 && (
                            <div
                              className="h-2 rounded-full bg-blue-500"
                              style={{ width: `${barWidth}%` }}
                            />
                          )}
                        </div>
                        <span
                          className={`text-xs font-medium w-16 text-center ${
                            gap > 0
                              ? "text-red-400"
                              : gap < 0
                              ? "text-blue-400"
                              : "text-gray-500"
                          }`}
                        >
                          {gap > 0 ? "+" : ""}
                          {gap.toFixed(1)}%
                        </span>
                        <div className="flex-1">
                          {gap > 0 && (
                            <div
                              className="h-2 rounded-full bg-red-500"
                              style={{ width: `${barWidth}%` }}
                            />
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-600 text-xs text-center block">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {adjustKRW !== null ? (
                      <span
                        className={`text-xs font-medium ${
                          adjustKRW > 0 ? "text-red-400" : "text-blue-400"
                        }`}
                      >
                        {adjustKRW > 0 ? "매도" : "매수"}{" "}
                        ₩{fmt(Math.round(Math.abs(adjustKRW)))}
                      </span>
                    ) : (
                      <span className="text-gray-600 text-xs">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-gray-800 flex gap-4 text-xs text-gray-500">
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />
          양수 = 현재 비중 초과 (매도 고려)
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />
          음수 = 현재 비중 부족 (매수 고려)
        </span>
        <span className="ml-auto text-gray-600">목표 비중 셀 클릭 시 편집</span>
      </div>
    </div>
  );
}
