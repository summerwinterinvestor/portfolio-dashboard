import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const trades = await request.json();
    if (!Array.isArray(trades) || trades.length === 0) {
      return NextResponse.json({ error: 'trades must be a non-empty array' }, { status: 400 });
    }

    const toInsert = [];
    let skipped = 0;
    for (const t of trades) {
      const existing = await prisma.trade.findFirst({
        where: {
          holdingId: t.holdingId,
          type: t.type,
          quantity: Number(t.quantity),
          price: Number(t.price),
          tradeDate: new Date(t.tradeDate),
        },
      });
      if (existing) {
        skipped++;
      } else {
        toInsert.push(t);
      }
    }

    if (toInsert.length === 0) {
      return NextResponse.json({ imported: 0, skipped });
    }

    const result = await prisma.trade.createMany({
      data: toInsert.map((t) => ({
        holdingId: t.holdingId,
        type: t.type,
        quantity: Number(t.quantity),
        price: Number(t.price),
        tradeDate: new Date(t.tradeDate),
        thesis: null,
        fee: t.fee != null ? Number(t.fee) : null,
      })),
    });

    return NextResponse.json({ imported: result.count, skipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
