/**
 * 원/달러 환율 조회
 *
 * 우선순위:
 * 1. 한투 KIS API (FHKST03030100 / FX@USD) — 장 중에만 데이터 있음
 * 2. open.er-api.com (무료 공개 환율 API, 일 1회 갱신)
 * 3. frankfurter.app (ECB 기반, 일 1회 갱신)
 *
 * 실전에서 한투 FX 조회는 장 중(평일 09:00-15:30 KST)에만 유효하므로
 * 공개 API를 폴백으로 사용합니다.
 */

import { getAccessToken } from "./auth";

export interface FxRate {
  usdKrw: number;  // 1 USD = N KRW
  fetchedAt: Date;
  source?: string;  // 데이터 출처
}

function getBaseUrl(): string {
  const env = process.env.KIS_ENV ?? "real";
  if (env === "real") {
    return "https://openapi.koreainvestment.com:9443";
  }
  return "https://openapivts.koreainvestment.com:29443";
}

async function fetchFxViaKIS(
  token: string,
  appKey: string,
  appSecret: string,
  baseUrl: string
): Promise<number | null> {
  try {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");

    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "X",
      FID_INPUT_ISCD: "FX@USD",
      FID_INPUT_DATE_1: weekAgo,
      FID_INPUT_DATE_2: dateStr,
      FID_PERIOD_DIV_CODE: "D",
    });

    const response = await fetch(
      `${baseUrl}/uapi/overseas-price/v1/quotations/inquire-daily-chartprice?${params}`,
      {
        method: "GET",
        headers: {
          "content-type": "application/json; charset=utf-8",
          authorization: `Bearer ${token}`,
          appkey: appKey,
          appsecret: appSecret,
          tr_id: "FHKST03030100",
          custtype: "P",
        },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (data.rt_cd !== "0") return null;

    // output1의 현재가 확인 (장 중에만 유효)
    const output1 = data.output1;
    if (output1?.ovrs_nmix_prpr && parseFloat(output1.ovrs_nmix_prpr) > 0) {
      return parseFloat(output1.ovrs_nmix_prpr);
    }

    // output2의 최근 종가 (가장 최근 거래일)
    const output2 = data.output2;
    if (Array.isArray(output2) && output2.length > 0) {
      const latest = output2[0];
      const price =
        parseFloat(latest.ovrs_nmix_prpr || "0") ||
        parseFloat(latest.stck_clpr || "0");
      if (price > 0) return price;
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchFxViaOpenExchangeRates(): Promise<number | null> {
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      headers: { "User-Agent": "portfolio-dashboard/1.0" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const krw = data?.rates?.KRW;
    return krw && krw > 0 ? krw : null;
  } catch {
    return null;
  }
}

async function fetchFxViaFrankfurter(): Promise<number | null> {
  try {
    const response = await fetch("https://api.frankfurter.app/latest?from=USD&to=KRW", {
      headers: { "User-Agent": "portfolio-dashboard/1.0" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const krw = data?.rates?.KRW;
    return krw && krw > 0 ? krw : null;
  } catch {
    return null;
  }
}

/**
 * 원/달러 환율을 조회합니다.
 * 한투 KIS API (장 중) → open.er-api.com → frankfurter.app 순으로 시도합니다.
 */
export async function getUsdKrwRate(): Promise<FxRate> {
  const appKey = process.env.KIS_APP_KEY!;
  const appSecret = process.env.KIS_APP_SECRET!;
  const baseUrl = getBaseUrl();

  // 1. 한투 KIS API 시도 (장 중에만 유효)
  try {
    const token = await getAccessToken();
    const rate = await fetchFxViaKIS(token, appKey, appSecret, baseUrl);
    if (rate) {
      console.log(`[KIS FX] Rate fetched via KIS API: ${rate}`);
      return { usdKrw: rate, fetchedAt: new Date(), source: "KIS" };
    }
  } catch {
    // KIS 실패 시 폴백으로 진행
  }

  // 2. open.er-api.com 시도
  const rate2 = await fetchFxViaOpenExchangeRates();
  if (rate2) {
    console.log(`[KIS FX] Rate fetched via open.er-api.com: ${rate2}`);
    return { usdKrw: rate2, fetchedAt: new Date(), source: "open.er-api.com" };
  }

  // 3. frankfurter.app 시도
  const rate3 = await fetchFxViaFrankfurter();
  if (rate3) {
    console.log(`[KIS FX] Rate fetched via frankfurter.app: ${rate3}`);
    return { usdKrw: rate3, fetchedAt: new Date(), source: "frankfurter.app" };
  }

  throw new Error("Failed to fetch USD/KRW exchange rate from all available sources");
}
