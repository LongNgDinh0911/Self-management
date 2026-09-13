import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const stepIds = body.stepIds as string[];

  if (!Array.isArray(stepIds)) {
    return NextResponse.json({ error: "Thiếu stepIds" }, { status: 400 });
  }

  await prisma.$transaction(
    stepIds.map((stepId, index) =>
      prisma.workflowStep.update({ where: { id: stepId }, data: { order: index } })
    )
  );

  return NextResponse.json({ ok: true });
}
