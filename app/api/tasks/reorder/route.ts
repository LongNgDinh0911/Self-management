import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emitTaskUpdate, taskWithRelationsInclude } from "@/lib/socket";
import type { TaskStatus } from "@/app/generated/prisma/client";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const status = body.status as TaskStatus;
  const taskIds = body.taskIds as string[];

  if (!status || !Array.isArray(taskIds)) {
    return NextResponse.json({ error: "Thiếu status hoặc taskIds" }, { status: 400 });
  }

  const updated = await prisma.$transaction(
    taskIds.map((taskId, index) =>
      prisma.task.update({
        where: { id: taskId },
        data: { status, order: index },
        include: taskWithRelationsInclude,
      })
    )
  );

  for (const task of updated) emitTaskUpdate(task);

  return NextResponse.json({ ok: true });
}
