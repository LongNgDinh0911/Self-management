import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { TaskStatus } from "@/app/generated/prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const body = await request.json();
  const title = String(body.title ?? "").trim();
  const status = (body.status as TaskStatus) ?? "backlog";

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
        order: (lastInColumn?.order ?? -1) + 1,
      },
    });
  });

  return NextResponse.json(task, { status: 201 });
}
