import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const holding = await prisma.holding.findUnique({
      where: { id },
      include: { trades: true, dividends: true },
    });
    if (!holding) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
    }
    return NextResponse.json(holding);
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
    const { ticker, market, name, currency, quantity, avgPrice, targetWeight, accountId, sector } =
      body;

    const holding = await prisma.holding.update({
      where: { id },
      data: {
        ...(ticker !== undefined && { ticker }),
        ...(market !== undefined && { market }),
        ...(name !== undefined && { name }),
        ...(currency !== undefined && { currency }),
        ...(quantity !== undefined && { quantity: Number(quantity) }),
        ...(avgPrice !== undefined && { avgPrice: Number(avgPrice) }),
        ...(targetWeight !== undefined && {
          targetWeight: targetWeight !== null ? Number(targetWeight) : null,
        }),
        ...('accountId' in body && { accountId: accountId || null }),
        ...('sector' in body && { sector: sector?.trim() || null }),
      },
      include: { account: true },
    });
    return NextResponse.json(holding);
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
    await prisma.holding.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
