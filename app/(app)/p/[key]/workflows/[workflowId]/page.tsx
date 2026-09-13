import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProjectHeader } from "@/components/project-header";
import { WorkflowBuilder } from "@/components/workflow-builder";

export default async function WorkflowBuilderPage({
  params,
}: {
  params: Promise<{ key: string; workflowId: string }>;
}) {
  const { key, workflowId } = await params;

  const project = await prisma.project.findUnique({
    where: { key: key.toUpperCase() },
  });
  if (!project) {
    notFound();
  }

  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  if (!workflow || workflow.projectId !== project.id) {
    notFound();
  }

  return (
    <div className="flex h-full flex-col">
      <ProjectHeader project={project} />
      <WorkflowBuilder initialWorkflow={workflow} projectKey={project.key} />
    </div>
  );
}
