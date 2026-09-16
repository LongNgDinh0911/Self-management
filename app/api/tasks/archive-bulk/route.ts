import { NextRequest, NextResponse } from "next/server";
import { bulkSetTasksArchived } from "@/lib/tasks";
import { emitTaskUpdate } from "@/lib/socket";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const taskIds = body.taskIds as string[];
  const archived = body.archived as boolean;

  if (!Array.isArray(taskIds) || taskIds.length === 0 || typeof archived !== "boolean") {
    return NextResponse.json({ error: "Thiếu taskIds hoặc archived" }, { status: 400 });
  }

  const tasks = await bulkSetTasksArchived(taskIds, archived);
  for (const task of tasks) emitTaskUpdate(task);

  return NextResponse.json({ ok: true, tasks });
}
