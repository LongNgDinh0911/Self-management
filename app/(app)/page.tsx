import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const firstProject = await prisma.project.findFirst({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
  });

  if (firstProject) {
    redirect(`/p/${firstProject.key}`);
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <p className="text-neutral-300">Chưa có project nào.</p>
        <p className="mt-1 text-sm text-neutral-500">
          Bấm nút &ldquo;+&rdquo; ở sidebar để tạo project đầu tiên.
        </p>
      </div>
    </div>
  );
}
