/**
 * 한국투자증권 Open API 접근토큰 발급 및 메모리 캐싱
 * - 토큰 유효기간: 24시간
 * - 만료 5분 전 자동 갱신
 * - 토큰 값은 로그에 출력하지 않음
 */

interface TokenCache {
  token: string;
  expiresAt: Date;
}

let cache: TokenCache | null = null;
let pendingFetch: Promise<TokenCache> | null = null;

function getBaseUrl(): string {
  const env = process.env.KIS_ENV ?? "real";
  if (env === "real") {
    return "https://openapi.koreainvestment.com:9443";
  }
  return "https://openapivts.koreainvestment.com:29443";
}

function isTokenValid(cache: TokenCache): boolean {
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  return cache.expiresAt > fiveMinutesFromNow;
}

async function fetchNewToken(): Promise<TokenCache> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;

  if (!appKey || !appSecret) {
    throw new Error("KIS_APP_KEY or KIS_APP_SECRET is not set in environment variables");
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/oauth2/tokenP`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: appKey,
      appsecret: appSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`KIS token request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error("KIS token response missing access_token");
  }

  // access_token_token_expired 형식: "2024-01-01 00:00:00"
  let expiresAt: Date;
  if (data.access_token_token_expired) {
    expiresAt = new Date(data.access_token_token_expired.replace(" ", "T") + "+09:00");
  } else {
    // 기본값: 24시간 후
    expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  console.log(`[KIS Auth] New token issued. Expires at: ${expiresAt.toISOString()}`);

  return {
    token: data.access_token,
    expiresAt,
  };
}

/**
 * 유효한 접근토큰을 반환합니다.
 * 캐시된 토큰이 유효하면 재사용, 만료 5분 이내이면 신규 발급합니다.
 */
export async function getAccessToken(): Promise<string> {
  if (cache && isTokenValid(cache)) {
    return cache.token;
  }

  // 이미 발급 중이면 같은 Promise를 공유 — KIS에 중복 요청하지 않음
  if (!pendingFetch) {
    pendingFetch = fetchNewToken().finally(() => {
      pendingFetch = null;
    });
  }

  cache = await pendingFetch;
  return cache.token;
}
