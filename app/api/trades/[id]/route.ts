import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const trade = await prisma.trade.findUnique({
      where: { id },
      include: {
        holding: {
          select: { ticker: true, name: true, market: true },
        },
      },
    });
    if (!trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }
    return NextResponse.json(trade);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { type, quantity, price, tradeDate, thesis, fee, accountId } = body;

    const trade = await prisma.trade.update({
      where: { id },
      data: {
        ...(type !== undefined && { type }),
        ...(quantity !== undefined && { quantity: Number(quantity) }),
        ...(price !== undefined && { price: Number(price) }),
        ...(tradeDate !== undefined && { tradeDate: new Date(tradeDate) }),
        ...(thesis !== undefined && { thesis }),
        ...('fee' in body && { fee: fee != null ? Number(fee) : null }),
        ...('accountId' in body && { accountId: accountId ?? null }),
      },
    });
    return NextResponse.json(trade);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await prisma.trade.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
