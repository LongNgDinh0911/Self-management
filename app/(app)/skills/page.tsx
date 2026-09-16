import { prisma } from "@/lib/prisma";
import { SkillVault } from "@/components/skill-vault";

export default async function SkillsPage() {
  const skills = await prisma.skill.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-neutral-800 px-5 py-3">
        <h1 className="text-sm font-semibold text-neutral-100">Skill Vault</h1>
        <p className="mt-0.5 text-xs text-neutral-500">
          Kho skill dùng chung cho mọi project — bật/tắt riêng từng project ở Project Settings,
          rồi gán làm skill mặc định cho từng AI step trong Workflow Builder.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <SkillVault initialSkills={skills} />
      </div>
    </div>
  );
}
