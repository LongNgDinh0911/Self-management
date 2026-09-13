import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProjectHeader } from "@/components/project-header";
import { WorkflowList } from "@/components/workflow-list";

export default async function ProjectWorkflowsPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  const project = await prisma.project.findUnique({
    where: { key: key.toUpperCase() },
  });

  if (!project) {
    notFound();
  }

  const workflows = await prisma.workflow.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { steps: true } } },
  });

  return (
    <div className="flex h-full flex-col">
      <ProjectHeader project={project} />
      <div className="flex-1 overflow-y-auto p-5">
        <WorkflowList projectId={project.id} projectKey={project.key} initialWorkflows={workflows} />
      </div>
    </div>
  );
}
