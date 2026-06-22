import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const include = searchParams.get('include') ?? '';
  const includeTrades = include.split(',').includes('trades');
  const includeDividends = include.split(',').includes('dividends');

  const activeOnly = searchParams.get('active') === 'true';

  try {
    const holdings = await prisma.holding.findMany({
      where: activeOnly ? { quantity: { gt: 0 } } : undefined,
      include: {
        trades: includeTrades,
        dividends: includeDividends,
        account: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(holdings);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticker, market, name, currency, quantity, avgPrice, targetWeight, accountId, sector } =
      body;

    if (!ticker || !market || !name || !currency || quantity == null || avgPrice == null) {
      return NextResponse.json(
        { error: 'ticker, market, name, currency, quantity, avgPrice are required' },
        { status: 400 }
      );
    }

    const holding = await prisma.holding.create({
      data: {
        ticker,
        market,
        name,
        currency,
        quantity: Number(quantity),
        avgPrice: Number(avgPrice),
        targetWeight: targetWeight != null ? Number(targetWeight) : null,
        accountId: accountId || null,
        sector: sector?.trim() || null,
      },
      include: { account: true },
    });
    return NextResponse.json(holding, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
