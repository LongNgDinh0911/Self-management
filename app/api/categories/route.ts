import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const categories = await prisma.category.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { projects: true } } },
  });
  return NextResponse.json(categories);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const color = typeof body.color === "string" ? body.color : "#6366f1";

  if (!name) {
    return NextResponse.json({ error: "Thiếu tên category" }, { status: 400 });
  }

  const existing = await prisma.category.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "Tên category đã tồn tại" }, { status: 409 });
  }

  const category = await prisma.category.create({
    data: { name, color },
  });

  return NextResponse.json(category, { status: 201 });
}
