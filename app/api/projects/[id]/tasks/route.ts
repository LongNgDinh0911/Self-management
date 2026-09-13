import { NextRequest, NextResponse } from "next/server";
import { createTask } from "@/lib/tasks";
import type { TaskPriority, TaskStatus, TaskType } from "@/app/generated/prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const body = await request.json();

  if (!String(body.title ?? "").trim()) {
    return NextResponse.json({ error: "Thiếu tiêu đề task" }, { status: 400 });
  }

  const task = await createTask(projectId, {
    title: String(body.title ?? ""),
    description: typeof body.description === "string" ? body.description : "",
    status: body.status as TaskStatus | undefined,
    priority: body.priority as TaskPriority | undefined,
    type: body.type as TaskType | undefined,
    estimate: typeof body.estimate === "number" ? body.estimate : null,
    dueDate: body.dueDate ?? null,
    jiraKey: typeof body.jiraKey === "string" ? body.jiraKey : null,
    jiraUrl: typeof body.jiraUrl === "string" ? body.jiraUrl : null,
  });

  return NextResponse.json(task, { status: 201 });
}
