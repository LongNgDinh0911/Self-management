import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const projects = await prisma.project.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const key = String(body.key ?? "")
    .trim()
    .toUpperCase();
  const color = typeof body.color === "string" ? body.color : "#6366f1";

  if (!name || !key) {
    return NextResponse.json({ error: "Thiếu tên hoặc mã project" }, { status: 400 });
  }
  if (!/^[A-Z0-9]{2,6}$/.test(key)) {
    return NextResponse.json(
      { error: "Mã project phải là 2-6 ký tự chữ/số (vd: DEV)" },
      { status: 400 }
    );
  }

  const existing = await prisma.project.findUnique({ where: { key } });
  if (existing) {
    return NextResponse.json({ error: "Mã project đã tồn tại" }, { status: 409 });
  }

  const project = await prisma.project.create({
    data: { name, key, color },
  });

  return NextResponse.json(project, { status: 201 });
}
