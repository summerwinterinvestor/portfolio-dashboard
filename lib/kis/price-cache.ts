import { getDomesticPrice } from './domestic-price';
import { getOverseasPrice, type ExchangeCode } from './overseas-price';
import type { DomesticPrice } from './domestic-price';

const TTL_MS = 60_000; // 1분

interface CacheEntry {
  data: DomesticPrice;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function getCachedDomesticPrice(ticker: string): Promise<DomesticPrice> {
  const key = `KR:${ticker}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.data;
  const data = await getDomesticPrice(ticker);
  cache.set(key, { data, expiresAt: now + TTL_MS });
  return data;
}

export async function getCachedOverseasPrice(
  ticker: string,
  exchange: ExchangeCode
): Promise<DomesticPrice> {
  const key = `US:${ticker}:${exchange}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.data;
  const data = await getOverseasPrice(ticker, exchange);
  cache.set(key, { data, expiresAt: now + TTL_MS });
  return data;
}
