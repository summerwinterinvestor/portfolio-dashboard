import type { Holding, Account, FxRate, Asset } from "@/types";
import HoldingManager from "@/components/HoldingManager";
import DashboardTable from "@/components/DashboardTable";

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

async function fetchAssets(): Promise<Asset[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/assets`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function fetchAccounts(): Promise<Account[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/accounts`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const [holdings, fxData, assets, accounts] = await Promise.all([
    fetchHoldings(),
    fetchFx(),
    fetchAssets(),
    fetchAccounts(),
  ]);

  return (
    <div>
      <HoldingManager accounts={accounts} />
      <DashboardTable
        holdings={holdings}
        usdKrw={fxData?.usdKrw ?? 0}
        assets={assets}
        accounts={accounts}
      />
    </div>
  );
}
