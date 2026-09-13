import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { TaskPriority, TaskStatus, TaskType } from "@/app/generated/prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const body = await request.json();
  const title = String(body.title ?? "").trim();
  const status = (body.status as TaskStatus) ?? "backlog";
  const priority = (body.priority as TaskPriority) ?? "none";
  const type = (body.type as TaskType) ?? "task";
  const description = typeof body.description === "string" ? body.description : "";
  const estimate = typeof body.estimate === "number" ? body.estimate : null;
  const dueDate = body.dueDate ? new Date(body.dueDate) : null;
  const jiraKey = typeof body.jiraKey === "string" ? body.jiraKey.trim() || null : null;
  const jiraUrl = typeof body.jiraUrl === "string" ? body.jiraUrl.trim() || null : null;

  if (!title) {
    return NextResponse.json({ error: "Thiếu tiêu đề task" }, { status: 400 });
  }

  const task = await prisma.$transaction(async (tx) => {
    const project = await tx.project.update({
      where: { id: projectId },
      data: { nextTaskNumber: { increment: 1 } },
    });

    const lastInColumn = await tx.task.findFirst({
      where: { projectId, status },
      orderBy: { order: "desc" },
    });

    return tx.task.create({
      data: {
        projectId,
        number: project.nextTaskNumber - 1,
        title,
        status,
        priority,
        type,
        description,
        estimate,
        dueDate,
        jiraKey,
        jiraUrl,
        order: (lastInColumn?.order ?? -1) + 1,
      },
    });
  });

  return NextResponse.json(task, { status: 201 });
}
