"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PROJECT_COLORS } from "@/lib/constants";
import type { Project } from "@/app/generated/prisma/client";

export function ProjectSettingsForm({ project }: { project: Project }) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState(project.color);
  const [repoUrl, setRepoUrl] = useState(project.repoUrl ?? "");
  const [repoLocalPath, setRepoLocalPath] = useState(project.repoLocalPath ?? "");
  const [defaultBranch, setDefaultBranch] = useState(project.defaultBranch);
  const [jiraSite, setJiraSite] = useState(project.jiraSite ?? "");
  const [jiraProjectKey, setJiraProjectKey] = useState(project.jiraProjectKey ?? "");
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
        name: name.trim(),
        color,
        repoUrl: repoUrl.trim() || null,
        repoLocalPath: repoLocalPath.trim() || null,
        defaultBranch: defaultBranch.trim() || "main",
        jiraSite: jiraSite.trim() || null,
        jiraProjectKey: jiraProjectKey.trim() || null,
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
      <h2 className="mb-1 text-sm font-semibold text-neutral-100">General</h2>
      <p className="mb-5 text-xs text-neutral-500">Tên và màu hiển thị của project.</p>

      <div className="mb-8 space-y-4">
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Tên project</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Màu</label>
          <div className="flex gap-2">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full ${
                  color === c ? "ring-2 ring-offset-2 ring-offset-neutral-950 ring-neutral-200" : ""
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>

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

      <h2 className="mb-1 mt-8 text-sm font-semibold text-neutral-100">Jira</h2>
      <p className="mb-5 text-xs text-neutral-500">
        Dùng bởi skill <code className="text-neutral-400">clone-jira-ticket</code> để biết
        site/project mặc định, không cần nêu lại mỗi lần clone ticket.
      </p>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Jira site</label>
          <input
            value={jiraSite}
            onChange={(e) => setJiraSite(e.target.value)}
            placeholder="yourcompany.atlassian.net"
            className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Jira project key mặc định</label>
          <input
            value={jiraProjectKey}
            onChange={(e) => setJiraProjectKey(e.target.value.toUpperCase())}
            placeholder="PROJ"
            className="w-40 rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm uppercase text-neutral-100 outline-none focus:border-indigo-500"
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

      <DangerZone project={project} />
    </div>
  );
}

function DangerZone({ project }: { project: Project }) {
  const router = useRouter();
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function handleToggleArchive() {
    setArchiving(true);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !project.archived }),
    });
    setArchiving(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    }
  }

  async function handleDelete() {
    if (confirmText.trim() !== project.name) return;
    setDeleting(true);
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="mt-10 rounded-lg border border-red-900/50 p-4">
      <h2 className="mb-1 text-sm font-semibold text-red-400">Danger zone</h2>
      <p className="mb-4 text-xs text-neutral-500">
        Lưu trữ hoặc xóa vĩnh viễn project này cùng toàn bộ task, label, workflow bên trong.
      </p>

      <div className="mb-4 flex items-center justify-between rounded-md border border-neutral-800 px-3 py-2">
        <div>
          <p className="text-sm text-neutral-200">
            {project.archived ? "Project đang bị lưu trữ" : "Lưu trữ project"}
          </p>
          <p className="text-xs text-neutral-500">
            {project.archived
              ? "Bỏ lưu trữ để project hiện lại trong sidebar."
              : "Ẩn khỏi sidebar, không xóa dữ liệu. Có thể bỏ lưu trữ sau."}
          </p>
        </div>
        <button
          onClick={handleToggleArchive}
          disabled={archiving}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
        >
          {archiving ? "Đang xử lý..." : project.archived ? "Bỏ lưu trữ" : "Lưu trữ"}
        </button>
      </div>

      {!showDeleteConfirm ? (
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="text-sm text-red-400 hover:text-red-300"
        >
          Xóa project vĩnh viễn
        </button>
      ) : (
        <div className="rounded-md border border-red-900/50 bg-red-950/20 p-3">
          <p className="mb-2 text-xs text-neutral-300">
            Gõ lại tên project <span className="font-semibold text-neutral-100">{project.name}</span>{" "}
            để xác nhận xóa — không thể hoàn tác.
          </p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={project.name}
            className="mb-3 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-red-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowDeleteConfirm(false);
                setConfirmText("");
              }}
              className="rounded-md px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
            >
              Hủy
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting || confirmText.trim() !== project.name}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-40"
            >
              {deleting ? "Đang xóa..." : "Xóa vĩnh viễn"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
