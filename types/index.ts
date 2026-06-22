export interface Account {
  id: string;
  broker: string;
  name: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { holdings: number };
}

export interface Holding {
  id: string;
  ticker: string;
  market: 'KR' | 'US';
  name: string;
  currency: 'KRW' | 'USD';
  quantity: number;
  avgPrice: number;
  targetWeight: number | null;
  exchange: string | null;
  sector: string | null;
  accountId: string | null;
  account: Account | null;
  createdAt: string;
  updatedAt: string;
}

export interface Trade {
  id: string;
  holdingId: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  tradeDate: string;
  thesis: string | null;
  fee: number | null;
  createdAt: string;
  holding?: Pick<Holding, 'ticker' | 'name' | 'market' | 'currency'>;
}

export interface Dividend {
  id: string;
  holdingId: string;
  amount: number;
  paidDate: string;
  createdAt: string;
  holding?: Pick<Holding, 'ticker' | 'name' | 'currency'>;
}

export interface Asset {
  id: string;
  category: 'REAL_ESTATE' | 'CASH' | 'LOAN' | 'OTHER';
  name: string;
  currency: 'KRW' | 'USD';
  value: number;
  valuedAt: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

// KIS API 응답 타입
export interface PriceData {
  ticker: string;
  currentPrice: number;
  change: number;
  changeRate: number;
  marketCap?: number;
}

export interface FxRate {
  usdKrw: number;
  fetchedAt: string;
  source?: string;
}

// 계산 결과 타입
export interface HoldingWithPrice extends Holding {
  currentPrice: number;
  currentValueKRW: number;  // 원화 환산 평가금액
  gainLoss: number;          // 수익금 (원화)
  gainLossRate: number;      // 수익률 (%)
  weight: number;            // 현재 비중 (%)
}

export interface NetWorth {
  stockValueKRW: number;
  realEstateValueKRW: number;
  cashValueKRW: number;
  totalKRW: number;
}
