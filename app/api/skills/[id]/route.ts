import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.content === "string") data.content = body.content;

  const skill = await prisma.skill.update({ where: { id }, data });
  return NextResponse.json(skill);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.skill.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
