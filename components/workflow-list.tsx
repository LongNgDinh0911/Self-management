"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Workflow } from "@/app/generated/prisma/client";

type WorkflowWithCount = Workflow & { _count: { steps: number } };

export function WorkflowList({
  projectId,
  projectKey,
  initialWorkflows,
}: {
  projectId: string;
  projectKey: string;
  initialWorkflows: WorkflowWithCount[];
}) {
  const router = useRouter();
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, name: "Workflow mới" }),
    });
    setCreating(false);
    if (res.ok) {
      const workflow = await res.json();
      router.push(`/p/${projectKey}/workflows/${workflow.id}`);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Xóa workflow này?")) return;
    setDeletingId(id);
    const res = await fetch(`/api/workflows/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) {
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-100">Workflows</h2>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {creating ? "Đang tạo..." : "+ Workflow mới"}
        </button>
      </div>

      {workflows.length === 0 && (
        <p className="text-sm text-neutral-500">
          Chưa có workflow nào. Tạo 1 workflow để AI tự động sửa code từ task.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {workflows.map((workflow) => (
          <div
            key={workflow.id}
            className="group flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 hover:border-neutral-700"
          >
            <button
              onClick={() => router.push(`/p/${projectKey}/workflows/${workflow.id}`)}
              className="flex flex-1 items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-100">{workflow.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    workflow.active
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-neutral-800 text-neutral-500"
                  }`}
                >
                  {workflow.active ? "Active" : "Inactive"}
                </span>
              </div>
              <span className="text-xs text-neutral-500">{workflow._count.steps} step</span>
            </button>
            <button
              onClick={() => handleDelete(workflow.id)}
              disabled={deletingId === workflow.id}
              title="Xóa workflow"
              className="ml-3 shrink-0 text-neutral-600 opacity-0 hover:text-red-400 disabled:opacity-50 group-hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
