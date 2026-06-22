import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 같은 티커를 가진 모든 holdings의 목표 비중을 일괄 업데이트
export async function PATCH(request: NextRequest) {
  try {
    const { ticker, targetWeight } = await request.json();

    if (!ticker) {
      return NextResponse.json({ error: "ticker is required" }, { status: 400 });
    }

    const weight =
      targetWeight === null || targetWeight === undefined
        ? null
        : Number(targetWeight);

    await prisma.holding.updateMany({
      where: { ticker },
      data: { targetWeight: weight },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
