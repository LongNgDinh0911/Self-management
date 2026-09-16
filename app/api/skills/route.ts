import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function GET() {
  const skills = await prisma.skill.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(skills);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = String(body.name ?? "").trim().toLowerCase();

  if (!name || !NAME_PATTERN.test(name)) {
    return NextResponse.json(
      { error: "Tên skill chỉ gồm chữ thường, số và dấu gạch ngang (vd: clone-jira-ticket)" },
      { status: 400 }
    );
  }

  const existing = await prisma.skill.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "Đã có skill tên này" }, { status: 409 });
  }

  const skill = await prisma.skill.create({
    data: {
      name,
      description: typeof body.description === "string" ? body.description : "",
      content: typeof body.content === "string" ? body.content : "",
    },
  });

  return NextResponse.json(skill, { status: 201 });
}
