import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const holdingId = searchParams.get('holdingId');

  try {
    const trades = await prisma.trade.findMany({
      where: holdingId ? { holdingId } : undefined,
      include: {
        holding: {
          select: { ticker: true, name: true, market: true, currency: true },
        },
      },
      orderBy: { tradeDate: 'desc' },
    });
    return NextResponse.json(trades);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { holdingId, type, quantity, price, tradeDate, thesis } = body;

    if (!holdingId || !type || quantity == null || price == null || !tradeDate) {
      return NextResponse.json(
        { error: 'holdingId, type, quantity, price, tradeDate are required' },
        { status: 400 }
      );
    }

    const trade = await prisma.trade.create({
      data: {
        holdingId,
        type,
        quantity: Number(quantity),
        price: Number(price),
        tradeDate: new Date(tradeDate),
        thesis: thesis ?? null,
      },
    });
    return NextResponse.json(trade, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
