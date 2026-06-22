import { NextRequest, NextResponse } from 'next/server';

interface NaverItem {
  code: string;
  name: string;
  nationCode: string;
  typeCode: string;
  typeName?: string;
  category?: string;
}

interface NaverACResponse {
  items: NaverItem[];
  query: string;
}

export interface StockSuggestion {
  ticker: string;
  name: string;
  market: 'KR' | 'US';
  currency: 'KRW' | 'USD';
}

// GET /api/search?q=삼성전자
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 1) return NextResponse.json([]);

  try {
    const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return NextResponse.json([]);

    const data: NaverACResponse = await res.json();
    const items: NaverItem[] = data?.items ?? [];

    const suggestions: StockSuggestion[] = items
      .filter((item) => {
        return item.nationCode === 'KOR' || item.nationCode === 'USA';
      })
      .slice(0, 8)
      .map((item) => {
        const isKR = item.nationCode === 'KOR';
        return {
          ticker: item.code,
          name: item.name,
          market: (isKR ? 'KR' : 'US') as 'KR' | 'US',
          currency: (isKR ? 'KRW' : 'USD') as 'KRW' | 'USD',
        };
      })
      .filter((s) => s.ticker && s.name);

    return NextResponse.json(suggestions);
  } catch {
    return NextResponse.json([]);
  }
}
