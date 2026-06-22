import type { Asset } from "@/types";

interface Props {
  stockValueKRW: number;
  assets: Asset[];
  usdKrw: number;
  pricesLoading?: boolean;
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function Skeleton({ w = "w-32" }: { w?: string }) {
  return <span className={`inline-block ${w} h-7 bg-gray-700/60 rounded animate-pulse`} />;
}

export default function NetWorthSummary({ stockValueKRW, assets, usdKrw, pricesLoading }: Props) {
  const toKRW = (a: { value: number; currency: string }) =>
    a.currency === "USD" ? a.value * usdKrw : a.value;

  const realEstateValueKRW = assets
    .filter((a) => a.category === "REAL_ESTATE")
    .reduce((sum, a) => sum + toKRW(a), 0);

  const cashValueKRW = assets
    .filter((a) => a.category === "CASH")
    .reduce((sum, a) => sum + toKRW(a), 0);

  const loanValueKRW = assets
    .filter((a) => a.category === "LOAN")
    .reduce((sum, a) => sum + toKRW(a), 0);

  const otherValueKRW = assets
    .filter((a) => a.category === "OTHER")
    .reduce((sum, a) => sum + toKRW(a), 0);

  const totalKRW = stockValueKRW + realEstateValueKRW + cashValueKRW + otherValueKRW - loanValueKRW;

  const sections = [
    { label: "주식", value: stockValueKRW, color: "text-blue-400", loading: pricesLoading },
    { label: "부동산", value: realEstateValueKRW, color: "text-purple-400", loading: false },
    { label: "현금", value: cashValueKRW, color: "text-yellow-400", loading: false },
    ...(otherValueKRW > 0
      ? [{ label: "기타", value: otherValueKRW, color: "text-gray-300", loading: false }]
      : []),
    ...(loanValueKRW > 0
      ? [{ label: "대출", value: -loanValueKRW, color: "text-red-400", loading: false }]
      : []),
  ];

  return (
    <div className="card bg-gray-900 p-5 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="label mb-1">총 순자산</p>
          <p className="text-3xl font-bold text-white">
            {pricesLoading
              ? <Skeleton w="w-44" />
              : <span className="private-value">{fmt(Math.round(totalKRW))}원</span>
            }
          </p>
        </div>
        <div className="flex gap-6">
          {sections.map((s) => (
            <div key={s.label} className="text-right">
              <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
              <p className={`text-sm font-medium ${s.color}`}>
                {s.loading
                  ? <span className="inline-block w-16 h-4 bg-gray-700/60 rounded animate-pulse" />
                  : <span className="private-value">{fmt(Math.round(s.value))}원</span>
                }
              </p>
            </div>
          ))}
        </div>
      </div>
      {usdKrw > 0 && (
        <p className="mt-3 text-xs text-gray-600">
          USD/KRW 환율 적용: {fmt(usdKrw)}원
        </p>
      )}
    </div>
  );
}
