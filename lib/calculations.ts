import type { NetWorth } from '@/types';

/**
 * 평가금액 = 수량 × 현재가 (USD면 × 환율)
 */
export function calcCurrentValue(
  quantity: number,
  currentPrice: number,
  currency: 'KRW' | 'USD',
  usdKrw: number
): number {
  const value = quantity * currentPrice;
  return currency === 'USD' ? value * usdKrw : value;
}

/**
 * 수익률 = (평가금액 - 매입원가) / 매입원가 × 100
 */
export function calcGainLossRate(
  currentValue: number,
  costBasis: number
): number {
  if (costBasis === 0) return 0;
  return ((currentValue - costBasis) / costBasis) * 100;
}

/**
 * yield on cost = 연간 배당금 합계 / 매입원가 × 100
 */
export function calcYieldOnCost(
  annualDividend: number,
  costBasis: number
): number {
  if (costBasis === 0) return 0;
  return (annualDividend / costBasis) * 100;
}

/**
 * 시가배당률 = 연간 배당금 합계 / 현재 평가금액 × 100
 */
export function calcCurrentYield(
  annualDividend: number,
  currentValue: number
): number {
  if (currentValue === 0) return 0;
  return (annualDividend / currentValue) * 100;
}

/**
 * 리밸런싱 괴리 = 현재 비중 - 목표 비중
 */
export function calcRebalanceGap(
  currentWeight: number,
  targetWeight: number
): number {
  return currentWeight - targetWeight;
}

/**
 * 총 순자산 계산
 * stockValuesKRW: 주식 평가금액 배열 (원화 환산 완료)
 * assets: Asset 배열 (부동산 + 현금)
 * usdKrw: 원달러 환율
 */
export function calculateNetWorth(
  stockValuesKRW: number[],
  assets: Array<{ category: string; currency: 'KRW' | 'USD'; value: number }>,
  usdKrw: number
): NetWorth {
  const stockValueKRW = stockValuesKRW.reduce((sum, v) => sum + v, 0);

  let realEstateValueKRW = 0;
  let cashValueKRW = 0;

  for (const asset of assets) {
    const valueKRW =
      asset.currency === 'USD' ? asset.value * usdKrw : asset.value;

    if (asset.category === 'REAL_ESTATE') {
      realEstateValueKRW += valueKRW;
    } else if (asset.category === 'CASH') {
      cashValueKRW += valueKRW;
    }
  }

  return {
    stockValueKRW,
    realEstateValueKRW,
    cashValueKRW,
    totalKRW: stockValueKRW + realEstateValueKRW + cashValueKRW,
  };
}
