import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Board } from "@/components/board";

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  const project = await prisma.project.findUnique({
    where: { key: key.toUpperCase() },
    include: {
      tasks: { orderBy: { order: "asc" } },
    },
  });

  if (!project) {
    notFound();
  }

  return <Board project={project} initialTasks={project.tasks} />;
}
