import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const workflow = await prisma.workflow.findUnique({
    where: { id },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  if (!workflow) {
    return NextResponse.json({ error: "Không tìm thấy workflow" }, { status: 404 });
  }
  return NextResponse.json(workflow);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.active === "boolean") data.active = body.active;

  const workflow = await prisma.workflow.update({
    where: { id },
    data,
    include: { steps: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(workflow);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.workflow.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
