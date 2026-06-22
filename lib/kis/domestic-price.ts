/**
 * 한국투자증권 국내주식 현재가 조회
 * API: /uapi/domestic-stock/v1/quotations/inquire-price
 * tr_id: FHKST01010100
 */

import { getAccessToken } from "./auth";
import { acquireRateLimit } from "./rate-limiter";

export interface DomesticPrice {
  ticker: string;
  currentPrice: number;
  change: number;      // 전일대비
  changeRate: number;  // 등락률 (%)
  marketCap?: number;
}

const MAX_RETRIES = 2;

function getBaseUrl(): string {
  const env = process.env.KIS_ENV ?? "real";
  if (env === "real") {
    return "https://openapi.koreainvestment.com:9443";
  }
  return "https://openapivts.koreainvestment.com:29443";
}

export async function getDomesticPrice(ticker: string, attempt = 0): Promise<DomesticPrice> {
  await acquireRateLimit();
  const token = await getAccessToken();
  const appKey = process.env.KIS_APP_KEY!;
  const appSecret = process.env.KIS_APP_SECRET!;
  const baseUrl = getBaseUrl();

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "J",
    FID_INPUT_ISCD: ticker,
  });

  const response = await fetch(
    `${baseUrl}/uapi/domestic-stock/v1/quotations/inquire-price?${params}`,
    {
      method: "GET",
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: "FHKST01010100",
        custtype: "P",
      },
    }
  );

  let data: Record<string, unknown>;
  try {
    data = await response.json();
  } catch {
    throw new Error(`KIS domestic price request failed: ${response.status} ${response.statusText}`);
  }

  // 초당 건수 초과 → 대기 후 재시도
  if (data.msg_cd === "EGW00201") {
    if (attempt < MAX_RETRIES) {
      await new Promise<void>((r) => setTimeout(r, 500 * (attempt + 1)));
      return getDomesticPrice(ticker, attempt + 1);
    }
    throw new Error(`KIS domestic price: rate limit exceeded after ${attempt + 1} attempts`);
  }

  if (data.rt_cd !== "0") {
    throw new Error(`KIS domestic price error: ${data.msg_cd} - ${data.msg1}`);
  }

  const output = data.output as Record<string, string>;

  const currentPrice = parseFloat(output.stck_prpr);
  if (!isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error(`KIS domestic price: invalid price for ${ticker}: ${output.stck_prpr}`);
  }

  return {
    ticker,
    currentPrice,
    change: parseFloat(output.prdy_vrss) || 0,
    changeRate: parseFloat(output.prdy_ctrt) || 0,
    marketCap: output.hts_avls ? parseFloat(output.hts_avls) : undefined,
  };
}
