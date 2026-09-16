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
    include: { projectSkills: { include: { skill: true } } },
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

  const availableSkills = project.projectSkills.map((ps) => ({
    id: ps.skill.id,
    name: ps.skill.name,
  }));

  return (
    <div className="flex h-full flex-col">
      <ProjectHeader project={project} />
      <WorkflowBuilder
        initialWorkflow={workflow}
        projectKey={project.key}
        availableSkills={availableSkills}
      />
    </div>
  );
}
