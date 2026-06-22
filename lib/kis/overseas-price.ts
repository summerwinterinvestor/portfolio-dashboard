/**
 * 한국투자증권 해외주식 현재체결가 조회
 * API: /uapi/overseas-price/v1/quotations/price
 * tr_id: HHDFS00000300
 * 거래소 코드: 나스닥=NAS, NYSE=NYS, 아멕스=AMS
 */

import { getAccessToken } from "./auth";
import { acquireRateLimit } from "./rate-limiter";
import type { DomesticPrice } from "./domestic-price";

export type OverseasPrice = DomesticPrice;

export type ExchangeCode = "NAS" | "NYS" | "AMS" | "TSE" | "HKS" | "SHS" | "SZS";

const MAX_RETRIES = 2;

function getBaseUrl(): string {
  const env = process.env.KIS_ENV ?? "real";
  if (env === "real") {
    return "https://openapi.koreainvestment.com:9443";
  }
  return "https://openapivts.koreainvestment.com:29443";
}

export async function getOverseasPrice(
  ticker: string,
  exchange: ExchangeCode = "NAS",
  attempt = 0
): Promise<OverseasPrice> {
  await acquireRateLimit();
  const token = await getAccessToken();
  const appKey = process.env.KIS_APP_KEY!;
  const appSecret = process.env.KIS_APP_SECRET!;
  const baseUrl = getBaseUrl();

  const params = new URLSearchParams({
    AUTH: "",
    EXCD: exchange,
    SYMB: ticker,
  });

  const response = await fetch(
    `${baseUrl}/uapi/overseas-price/v1/quotations/price?${params}`,
    {
      method: "GET",
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: "HHDFS00000300",
        custtype: "P",
      },
    }
  );

  let data: Record<string, unknown>;
  try {
    data = await response.json();
  } catch {
    throw new Error(`KIS overseas price request failed: ${response.status} ${response.statusText}`);
  }

  // 초당 건수 초과 → 대기 후 재시도
  if (data.msg_cd === "EGW00201") {
    if (attempt < MAX_RETRIES) {
      await new Promise<void>((r) => setTimeout(r, 500 * (attempt + 1)));
      return getOverseasPrice(ticker, exchange, attempt + 1);
    }
    throw new Error(`KIS overseas price: rate limit exceeded after ${attempt + 1} attempts`);
  }

  if (data.rt_cd !== "0") {
    throw new Error(`KIS overseas price error: ${data.msg_cd} - ${data.msg1}`);
  }

  const output = data.output as Record<string, string>;

  // 해외주식 응답 필드: last(현재가), diff(전일대비), rate(등락률)
  const currentPrice = parseFloat(output.last);
  if (!isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error(`KIS overseas price: invalid price for ${ticker}: ${output.last}`);
  }

  return {
    ticker,
    currentPrice,
    change: parseFloat(output.diff) || 0,
    changeRate: parseFloat(output.rate) || 0,
    marketCap: undefined,
  };
}
