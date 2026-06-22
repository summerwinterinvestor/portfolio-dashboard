import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { ticker, name, market, currency } = await request.json();
    if (!ticker || !name || !market || !currency) {
      return NextResponse.json(
        { error: 'ticker, name, market, currency are required' },
        { status: 400 }
      );
    }

    const existing = await prisma.holding.findFirst({ where: { ticker } });
    if (existing) return NextResponse.json(existing);

    const holding = await prisma.holding.create({
      data: { ticker, name, market, currency, quantity: 0, avgPrice: 0 },
    });
    return NextResponse.json(holding, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
