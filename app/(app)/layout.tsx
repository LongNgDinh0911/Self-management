import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const projects = await prisma.project.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, key: true, name: true, color: true },
  });

  return (
    <div className="flex h-screen bg-neutral-950">
      <Sidebar projects={projects} />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
