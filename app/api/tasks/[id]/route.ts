import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { TaskPriority, TaskStatus, TaskType } from "@/app/generated/prisma/client";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title.trim();
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.planning === "string") data.planning = body.planning;
  if (typeof body.status === "string") data.status = body.status as TaskStatus;
  if (typeof body.priority === "string") data.priority = body.priority as TaskPriority;
  if (typeof body.type === "string") data.type = body.type as TaskType;
  if (body.jiraKey === null || typeof body.jiraKey === "string") {
    data.jiraKey = body.jiraKey?.trim() || null;
  }
  if (body.jiraUrl === null || typeof body.jiraUrl === "string") {
    data.jiraUrl = body.jiraUrl?.trim() || null;
  }
  if (body.estimate === null || typeof body.estimate === "number") {
    data.estimate = body.estimate;
  }
  if (body.dueDate === null || typeof body.dueDate === "string") {
    data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  }

  const task = await prisma.task.update({ where: { id }, data });
  return NextResponse.json(task);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
