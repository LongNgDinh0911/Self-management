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
  if (typeof body.color === "string") data.color = body.color;
  if (typeof body.archived === "boolean") data.archived = body.archived;
  if (body.repoUrl === null || typeof body.repoUrl === "string") {
    data.repoUrl = body.repoUrl?.trim() || null;
  }
  if (body.repoLocalPath === null || typeof body.repoLocalPath === "string") {
    data.repoLocalPath = body.repoLocalPath?.trim() || null;
  }
  if (typeof body.defaultBranch === "string" && body.defaultBranch.trim()) {
    data.defaultBranch = body.defaultBranch.trim();
  }

  const project = await prisma.project.update({ where: { id }, data });
  return NextResponse.json(project);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
