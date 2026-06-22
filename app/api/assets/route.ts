import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category');

  try {
    const assets = await prisma.asset.findMany({
      where: category ? { category } : undefined,
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(assets);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, name, currency, value, valuedAt, memo } = body;

    if (!category || !name || !currency || value == null || !valuedAt) {
      return NextResponse.json(
        { error: 'category, name, currency, value, valuedAt are required' },
        { status: 400 }
      );
    }

    const asset = await prisma.asset.create({
      data: {
        category,
        name,
        currency,
        value: Number(value),
        valuedAt: new Date(valuedAt),
        memo: memo ?? null,
      },
    });
    return NextResponse.json(asset, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
