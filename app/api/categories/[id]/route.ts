import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Tên category không được để trống" }, { status: 400 });
    }
    const existing = await prisma.category.findUnique({ where: { name } });
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: "Tên category đã tồn tại" }, { status: 409 });
    }
    data.name = name;
  }
  if (typeof body.color === "string") data.color = body.color;
  if (typeof body.order === "number") data.order = body.order;

  const category = await prisma.category.update({ where: { id }, data });
  return NextResponse.json(category);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.category.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
