import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const holdingId = searchParams.get('holdingId');

  try {
    const dividends = await prisma.dividend.findMany({
      where: holdingId ? { holdingId } : undefined,
      include: {
        holding: {
          select: { ticker: true, name: true },
        },
      },
      orderBy: { paidDate: 'desc' },
    });
    return NextResponse.json(dividends);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { holdingId, amount, paidDate } = body;

    if (!holdingId || amount == null || !paidDate) {
      return NextResponse.json(
        { error: 'holdingId, amount, paidDate are required' },
        { status: 400 }
      );
    }

    const dividend = await prisma.dividend.create({
      data: {
        holdingId,
        amount: Number(amount),
        paidDate: new Date(paidDate),
      },
    });
    return NextResponse.json(dividend, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
