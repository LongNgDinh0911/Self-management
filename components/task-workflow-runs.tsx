"use client";

import { useState } from "react";
import { RUN_STATUS_META } from "@/lib/workflow-constants";
import type { WorkflowRun } from "@/app/generated/prisma/client";

type RunWithWorkflow = WorkflowRun & { workflow: { name: string } };
type WorkflowOption = { id: string; name: string; active: boolean };

export function TaskWorkflowRuns({
  taskId,
  workflows,
  initialRuns,
}: {
  taskId: string;
  workflows: WorkflowOption[];
  initialRuns: RunWithWorkflow[];
}) {
  const [runs, setRuns] = useState(initialRuns);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(workflows[0]?.id ?? "");
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTrigger() {
    if (!selectedWorkflowId) return;
    setTriggering(true);
    setError(null);

    const res = await fetch(`/api/tasks/${taskId}/workflow-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowId: selectedWorkflowId }),
    });

    setTriggering(false);

    if (!res.ok) {
      setError("Không trigger được workflow");
      return;
    }

    const run = await res.json();
    setRuns((prev) => [run, ...prev]);
  }

  return (
    <div className="mt-8 border-t border-neutral-800 pt-5">
      <h2 className="mb-1 text-sm font-semibold text-neutral-100">Workflow</h2>
      <p className="mb-4 text-xs text-neutral-500">
        Trigger 1 workflow cho task này. Execution engine (chạy AI thật) chưa được bật — lần chạy
        sẽ lưu lại ở trạng thái Pending trong lịch sử bên dưới cho tới khi được xác nhận bật.
      </p>

      {workflows.length === 0 ? (
        <p className="mb-4 text-xs text-neutral-600">
          Project chưa có workflow nào. Tạo ở tab{" "}
          <span className="text-neutral-400">Workflows</span> trước.
        </p>
      ) : (
        <div className="mb-5 flex items-center gap-2">
          <select
            value={selectedWorkflowId}
            onChange={(e) => setSelectedWorkflowId(e.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
          >
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {!w.active ? " (inactive)" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={handleTrigger}
            disabled={triggering || !selectedWorkflowId}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {triggering ? "Đang trigger..." : "▷ Run workflow"}
          </button>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
        Lịch sử ({runs.length})
      </h3>

      {runs.length === 0 ? (
        <p className="text-sm text-neutral-600">Chưa có lần chạy nào.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {runs.map((run) => {
            const meta = RUN_STATUS_META[run.status];
            return (
              <div
                key={run.id}
                className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: meta.color }}
                  />
                  <span className="text-sm text-neutral-200">{run.workflow.name}</span>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[11px]"
                    style={{ color: meta.color, backgroundColor: `${meta.color}1a` }}
                  >
                    {meta.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-500">
                  {run.prUrl && (
                    <a
                      href={run.prUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-400 hover:underline"
                    >
                      PR ↗
                    </a>
                  )}
                  <span>{new Date(run.startedAt).toLocaleString("vi-VN")}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
