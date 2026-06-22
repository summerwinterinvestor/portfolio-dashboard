import type { Holding, FxRate } from "@/types";
import TreemapLoader from "@/components/TreemapLoader";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

async function fetchHoldings(): Promise<Holding[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/holdings?active=true`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function fetchFx(): Promise<FxRate | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/kis/fx`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function TreemapPage() {
  const [holdings, fxData] = await Promise.all([fetchHoldings(), fetchFx()]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-white">트리맵</h1>
        {fxData && (
          <span className="text-xs text-gray-500">환율 {fxData.usdKrw.toLocaleString("ko-KR")}원</span>
        )}
      </div>
      <TreemapLoader holdings={holdings} usdKrw={fxData?.usdKrw ?? 0} />
    </div>
  );
}
