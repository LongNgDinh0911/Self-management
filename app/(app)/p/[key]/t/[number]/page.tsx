import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProjectHeader } from "@/components/project-header";
import { TaskDetailPage } from "@/components/task-detail-page";

export default async function TaskPage({
  params,
}: {
  params: Promise<{ key: string; number: string }>;
}) {
  const { key, number } = await params;
  const taskNumber = Number(number);

  const project = await prisma.project.findUnique({
    where: { key: key.toUpperCase() },
  });
  if (!project || !Number.isInteger(taskNumber)) {
    notFound();
  }

  const task = await prisma.task.findUnique({
    where: { projectId_number: { projectId: project.id, number: taskNumber } },
  });
  if (!task) {
    notFound();
  }

  return (
    <div className="flex h-full flex-col">
      <ProjectHeader project={project} />
      <TaskDetailPage project={project} task={task} />
    </div>
  );
}
