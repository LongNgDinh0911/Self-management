import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (body.config && typeof body.config === "object") {
    data.config = JSON.stringify(body.config);
  }

  const step = await prisma.workflowStep.update({ where: { id }, data });
  return NextResponse.json(step);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.workflowStep.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
