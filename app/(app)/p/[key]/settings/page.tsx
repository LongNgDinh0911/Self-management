import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getConnectionStatus } from "@/lib/jira-oauth";
import { ProjectHeader } from "@/components/project-header";
import { ProjectSettingsForm } from "@/components/project-settings-form";

export default async function ProjectSettingsPage({
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

  const jiraConnection = await getConnectionStatus();

  return (
    <div className="flex h-full flex-col">
      <ProjectHeader project={project} />
      <div className="flex-1 overflow-y-auto p-5">
        <ProjectSettingsForm project={project} jiraConnection={jiraConnection} />
      </div>
    </div>
  );
}
