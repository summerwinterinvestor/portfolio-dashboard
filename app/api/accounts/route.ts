import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: [{ broker: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { holdings: true } } },
    });
    return NextResponse.json(accounts);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { broker, name, memo } = await request.json();
    if (!broker || !name) {
      return NextResponse.json({ error: 'broker, name are required' }, { status: 400 });
    }
    const brokerTrimmed = broker.trim();
    const nameTrimmed = name.trim();
    const existing = await prisma.account.findFirst({
      where: { broker: brokerTrimmed, name: nameTrimmed },
    });
    if (existing) {
      return NextResponse.json({ error: '같은 증권사·계좌명 조합이 이미 존재합니다.' }, { status: 409 });
    }
    const account = await prisma.account.create({
      data: { broker: brokerTrimmed, name: nameTrimmed, memo: memo?.trim() || null },
    });
    return NextResponse.json(account, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
