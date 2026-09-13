"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/app/generated/prisma/client";

export function ProjectSettingsForm({ project }: { project: Project }) {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState(project.repoUrl ?? "");
  const [repoLocalPath, setRepoLocalPath] = useState(project.repoLocalPath ?? "");
  const [defaultBranch, setDefaultBranch] = useState(project.defaultBranch);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);

    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repoUrl: repoUrl.trim() || null,
        repoLocalPath: repoLocalPath.trim() || null,
        defaultBranch: defaultBranch.trim() || "main",
      }),
    });

    setSaving(false);

    if (!res.ok) {
      setError("Không lưu được cấu hình");
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <div className="max-w-xl">
      <h2 className="mb-1 text-sm font-semibold text-neutral-100">Repository</h2>
      <p className="mb-5 text-xs text-neutral-500">
        Cấu hình repo để AI workflow có thể clone/pull về máy và chỉnh sửa trực tiếp.
      </p>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Repo URL (git remote)</label>
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="git@github.com:owner/repo.git"
            className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-400">
            Local path (nơi đã/sẽ clone repo trên máy bạn)
          </label>
          <input
            value={repoLocalPath}
            onChange={(e) => setRepoLocalPath(e.target.value)}
            placeholder="/Users/you/Documents/my-repo"
            className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Default branch</label>
          <input
            value={defaultBranch}
            onChange={(e) => setDefaultBranch(e.target.value)}
            placeholder="main"
            className="w-40 rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? "Đang lưu..." : "Lưu"}
        </button>
        {saved && <span className="text-xs text-emerald-400">Đã lưu</span>}
      </div>
    </div>
  );
}
