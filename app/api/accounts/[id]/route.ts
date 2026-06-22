import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { broker, name, memo } = await request.json();
    const account = await prisma.account.update({
      where: { id },
      data: {
        ...(broker !== undefined && { broker: broker.trim() }),
        ...(name !== undefined && { name: name.trim() }),
        ...(memo !== undefined && { memo: memo?.trim() || null }),
      },
    });
    return NextResponse.json(account);
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
    // 보유 종목이 있으면 accountId를 null로 해제 후 삭제
    await prisma.holding.updateMany({ where: { accountId: id }, data: { accountId: null } });
    await prisma.account.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
