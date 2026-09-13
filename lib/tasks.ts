import { prisma } from "@/lib/prisma";
import type { TaskPriority, TaskStatus, TaskType } from "@/app/generated/prisma/client";

export type CreateTaskInput = {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  type?: TaskType;
  estimate?: number | null;
  dueDate?: string | null;
  jiraKey?: string | null;
  jiraUrl?: string | null;
};

export async function createTask(projectId: string, input: CreateTaskInput) {
  const title = input.title.trim();
  if (!title) throw new Error("Thiếu tiêu đề task");

  const status = input.status ?? "backlog";
  const priority = input.priority ?? "none";
  const type = input.type ?? "task";
  const description = input.description ?? "";
  const estimate = input.estimate ?? null;
  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  const jiraKey = input.jiraKey?.trim() || null;
  const jiraUrl = input.jiraUrl?.trim() || null;

  return prisma.$transaction(async (tx) => {
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
}
