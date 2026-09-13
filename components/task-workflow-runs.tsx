"use client";

import { useEffect, useRef, useState } from "react";
import { RUN_STATUS_META } from "@/lib/workflow-constants";
import type { WorkflowRun } from "@/app/generated/prisma/client";

type RunWithWorkflow = WorkflowRun & { workflow: { name: string } };
type WorkflowOption = { id: string; name: string; active: boolean };

const ACTIVE_STATUSES = new Set(["pending", "running"]);

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const pollingIds = useRef(new Set<string>());

  const hasActiveRun = runs.some((r) => ACTIVE_STATUSES.has(r.status));

  useEffect(() => {
    if (!hasActiveRun) return;

    const interval = setInterval(async () => {
      const active = runs.filter((r) => ACTIVE_STATUSES.has(r.status));
      const updates = await Promise.all(
        active.map((r) =>
          fetch(`/api/workflow-runs/${r.id}`)
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null)
        )
      );
      setRuns((prev) => {
        const byId = new Map(prev.map((r) => [r.id, r]));
        for (const updated of updates) {
          if (updated) byId.set(updated.id, updated);
        }
        return prev.map((r) => byId.get(r.id) ?? r);
      });
    }, 2500);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveRun, runs.map((r) => r.id + r.status).join(",")]);

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
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Không trigger được workflow");
      return;
    }

    const run = await res.json();
    setRuns((prev) => [run, ...prev]);
    setExpandedId(run.id);
  }

  async function handleStop(runId: string) {
    setStoppingId(runId);
    const res = await fetch(`/api/workflow-runs/${runId}/stop`, { method: "POST" });
    if (res.ok) {
      const updated = await res.json();
      setRuns((prev) => prev.map((r) => (r.id === runId ? { ...r, ...updated } : r)));
    }
    setStoppingId(null);
  }

  return (
    <div className="mt-8 border-t border-neutral-800 pt-5">
      <h2 className="mb-1 text-sm font-semibold text-neutral-100">Workflow</h2>
      <p className="mb-4 text-xs text-neutral-500">
        Trigger 1 workflow cho task này — chạy Claude Code trong 1 git worktree riêng của repo đã
        cấu hình ở Project Settings, rồi tạo PR nếu có thay đổi.
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
            const expanded = expandedId === run.id;
            return (
              <div
                key={run.id}
                className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedId(expanded ? null : run.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedId(expanded ? null : run.id);
                    }
                  }}
                  className="flex w-full cursor-pointer items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        run.status === "running" ? "animate-pulse" : ""
                      }`}
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
                        onClick={(e) => e.stopPropagation()}
                        className="text-indigo-400 hover:underline"
                      >
                        PR ↗
                      </a>
                    )}
                    {run.branchName && !run.prUrl && (
                      <span className="text-neutral-600">{run.branchName}</span>
                    )}
                    <span>{new Date(run.startedAt).toLocaleString("vi-VN")}</span>
                    {ACTIVE_STATUSES.has(run.status) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStop(run.id);
                        }}
                        disabled={stoppingId === run.id}
                        className="rounded-md border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-400 hover:border-red-500 hover:text-red-400 disabled:opacity-50"
                      >
                        {stoppingId === run.id ? "Đang dừng..." : "■ Stop"}
                      </button>
                    )}
                    <span className="text-neutral-600">{expanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {expanded && (
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-black/40 p-2.5 font-mono text-xs text-neutral-400">
                    {run.log || "(chưa có log)"}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
