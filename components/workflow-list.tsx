"use client";

import { useState, type MouseEvent } from "react";
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

  async function handleDelete(e: MouseEvent, workflowId: string) {
    e.stopPropagation();
    if (!confirm("Xóa workflow này? Toàn bộ step và lịch sử chạy sẽ bị xóa theo.")) return;
    const res = await fetch(`/api/workflows/${workflowId}`, { method: "DELETE" });
    if (res.ok) {
      setWorkflows((prev) => prev.filter((w) => w.id !== workflowId));
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
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/p/${projectKey}/workflows/${workflow.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter") router.push(`/p/${projectKey}/workflows/${workflow.id}`);
            }}
            className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-left hover:border-neutral-700"
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
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-500">{workflow._count.steps} step</span>
              <button
                onClick={(e) => handleDelete(e, workflow.id)}
                title="Xóa workflow"
                className="rounded-md px-1.5 py-1 text-neutral-500 hover:bg-red-500/10 hover:text-red-400"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
