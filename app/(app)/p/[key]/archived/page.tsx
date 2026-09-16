import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ArchivedView } from "@/components/archived-view";

export default async function ArchivedPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  const project = await prisma.project.findUnique({
    where: { key: key.toUpperCase() },
    include: {
      tasks: {
        where: { archivedAt: { not: null } },
        orderBy: { archivedAt: "desc" },
      },
    },
  });

  if (!project) {
    notFound();
  }

  return <ArchivedView project={project} initialTasks={project.tasks} />;
}
