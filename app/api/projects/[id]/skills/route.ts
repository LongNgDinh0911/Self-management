import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const body = await request.json();
  const skillId = String(body.skillId ?? "");
  const enabled = Boolean(body.enabled);

  if (!skillId) {
    return NextResponse.json({ error: "Thiếu skillId" }, { status: 400 });
  }

  if (enabled) {
    await prisma.projectSkill.upsert({
      where: { projectId_skillId: { projectId, skillId } },
      create: { projectId, skillId },
      update: {},
    });
  } else {
    await prisma.projectSkill.deleteMany({ where: { projectId, skillId } });
  }

  return NextResponse.json({ ok: true });
}
