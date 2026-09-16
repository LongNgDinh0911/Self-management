"use client";

import { useState } from "react";
import {
  PlayIcon,
  StopIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowTopRightOnSquareIcon,
  CodeBracketIcon,
} from "@heroicons/react/24/outline";
import { RUN_STATUS_META } from "@/lib/workflow-constants";
import { useWorkflowRunUpdates } from "@/lib/use-workflow-run-updates";
import { MarkdownView } from "@/components/markdown-editor";
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
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(
    workflows[0]?.id ?? "",
  );
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [chainOpenId, setChainOpenId] = useState<string | null>(null);
  const [chainWorkflowId, setChainWorkflowId] = useState(
    workflows[0]?.id ?? "",
  );
  const [chaining, setChaining] = useState(false);
  const [continuingId, setContinuingId] = useState<string | null>(null);
  const [diffOpenId, setDiffOpenId] = useState<string | null>(null);
  const [diffText, setDiffText] = useState<Record<string, string>>({});
  const [diffLoadingId, setDiffLoadingId] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Runs still watched for live socket updates: actively executing ones,
  // plus any run whose chain-picker is open (its own state can move to
  // "running" the instant the new chained run POST fires — a resumed or
  // continued run reuses the same id, so it needs to already be subscribed).
  const liveWatchIds = runs
    .filter(
      (r) => ACTIVE_STATUSES.has(r.status) || r.status === "crashed" || r.status === "paused"
    )
    .map((r) => r.id);

  useWorkflowRunUpdates<RunWithWorkflow>(liveWatchIds, (updated) => {
    setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  });

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
    const res = await fetch(`/api/workflow-runs/${runId}/stop`, {
      method: "POST",
    });
    if (res.ok) {
      const updated = await res.json();
      setRuns((prev) =>
        prev.map((r) => (r.id === runId ? { ...r, ...updated } : r)),
      );
    }
    setStoppingId(null);
  }

  async function handleResume(runId: string) {
    setResumingId(runId);
    setError(null);
    const res = await fetch(`/api/workflow-runs/${runId}/resume`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Không resume được run");
    }
    setResumingId(null);
  }

  async function handleContinue(runId: string) {
    setContinuingId(runId);
    setError(null);
    const res = await fetch(`/api/workflow-runs/${runId}/continue`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Không continue được run");
    }
    setContinuingId(null);
  }

  async function handleToggleDiff(runId: string) {
    if (diffOpenId === runId) {
      setDiffOpenId(null);
      return;
    }
    setDiffOpenId(runId);
    setDiffError(null);
    if (diffText[runId] !== undefined) return;
    setDiffLoadingId(runId);
    const res = await fetch(`/api/workflow-runs/${runId}/diff`);
    setDiffLoadingId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setDiffError(body?.error ?? "Không lấy được diff");
      return;
    }
    const body = await res.json();
    setDiffText((prev) => ({ ...prev, [runId]: body.diff }));
  }

  async function handleChain(parentRunId: string) {
    if (!chainWorkflowId) return;
    setChaining(true);
    setError(null);

    const res = await fetch(`/api/tasks/${taskId}/workflow-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowId: chainWorkflowId, parentRunId }),
    });

    setChaining(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Không trigger được workflow tiếp theo");
      return;
    }

    const run = await res.json();
    setRuns((prev) => [run, ...prev]);
    setChainOpenId(null);
    setExpandedId(run.id);
  }

  return (
    <div className="mt-8 border-t border-neutral-800 pt-5">
      <h2 className="mb-1 text-sm font-semibold text-neutral-100">Workflow</h2>
      <p className="mb-4 text-xs text-neutral-500">
        Trigger 1 workflow cho task này — chạy Claude Code trong 1 git worktree
        riêng của repo đã cấu hình ở Project Settings, rồi tạo PR nếu có thay
        đổi.
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
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {triggering ? (
              "Đang trigger..."
            ) : (
              <>
                <PlayIcon className="h-3.5 w-3.5" />
                Run workflow
              </>
            )}
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
                    <span className="text-sm text-neutral-200">
                      {run.workflow.name}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[11px]"
                      style={{
                        color: meta.color,
                        backgroundColor: `${meta.color}1a`,
                      }}
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
                        className="flex items-center gap-1 text-indigo-400 hover:underline"
                      >
                        PR
                        <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                      </a>
                    )}
                    {run.branchName && !run.prUrl && (
                      <span className="text-neutral-600">{run.branchName}</span>
                    )}
                    <span>
                      {new Date(run.startedAt).toLocaleString("vi-VN")}
                    </span>
                    {ACTIVE_STATUSES.has(run.status) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStop(run.id);
                        }}
                        disabled={stoppingId === run.id}
                        className="flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-400 hover:border-red-500 hover:text-red-400 disabled:opacity-50"
                      >
                        {stoppingId === run.id ? (
                          "Đang dừng..."
                        ) : (
                          <>
                            <StopIcon className="h-3 w-3" />
                            Stop
                          </>
                        )}
                      </button>
                    )}
                    {run.status === "crashed" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResume(run.id);
                        }}
                        disabled={resumingId === run.id}
                        className="rounded-md border border-indigo-700 px-2 py-0.5 text-[11px] text-indigo-400 hover:border-indigo-500 hover:text-indigo-300 disabled:opacity-50"
                      >
                        {resumingId === run.id ? "Đang resume..." : "▷ Resume"}
                      </button>
                    )}
                    {run.status === "paused" && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleDiff(run.id);
                          }}
                          className="flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
                        >
                          <CodeBracketIcon className="h-3 w-3" />
                          Xem diff
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStop(run.id);
                          }}
                          disabled={stoppingId === run.id}
                          className="flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-400 hover:border-red-500 hover:text-red-400 disabled:opacity-50"
                        >
                          {stoppingId === run.id ? (
                            "Đang dừng..."
                          ) : (
                            <>
                              <StopIcon className="h-3 w-3" />
                              Stop
                            </>
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleContinue(run.id);
                          }}
                          disabled={continuingId === run.id}
                          className="rounded-md border border-indigo-700 px-2 py-0.5 text-[11px] text-indigo-400 hover:border-indigo-500 hover:text-indigo-300 disabled:opacity-50"
                        >
                          {continuingId === run.id ? "Đang tiếp tục..." : "▷ Continue"}
                        </button>
                      </>
                    )}
                    {!ACTIVE_STATUSES.has(run.status) &&
                      run.branchName &&
                      workflows.length > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setChainOpenId(
                              chainOpenId === run.id ? null : run.id,
                            );
                          }}
                          className="rounded-md border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
                        >
                          ↳ Chạy tiếp
                        </button>
                      )}
                    <span className="text-neutral-600">
                      {expanded ? "▲" : "▼"}
                    </span>
                  </div>
                </div>

                {chainOpenId === run.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2 flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-2 py-2"
                  >
                    <span className="text-xs text-neutral-500">
                      Chạy tiếp trên branch{" "}
                      <span className="text-neutral-400">{run.branchName}</span>
                      :
                    </span>
                    <select
                      value={chainWorkflowId}
                      onChange={(e) => setChainWorkflowId(e.target.value)}
                      className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-indigo-500"
                    >
                      {workflows.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                          {!w.active ? " (inactive)" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleChain(run.id)}
                      disabled={chaining || !chainWorkflowId}
                      className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {chaining ? "Đang trigger..." : "▷ Chạy"}
                    </button>
                  </div>
                )}

                {diffOpenId === run.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2 rounded-md border border-neutral-800 bg-neutral-950 p-2.5"
                  >
                    {run.status === "paused" && run.worktreePath && (
                      <p className="mb-2 text-xs text-neutral-500">
                        Sửa code trực tiếp tại:{" "}
                        <code className="rounded bg-neutral-800 px-1 py-0.5 text-neutral-300">
                          {run.worktreePath}
                        </code>
                        , xong bấm Continue.
                      </p>
                    )}
                    {diffLoadingId === run.id ? (
                      <p className="text-xs text-neutral-500">Đang tải diff...</p>
                    ) : diffError ? (
                      <p className="text-xs text-red-400">{diffError}</p>
                    ) : (
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-xs text-neutral-400">
                        {diffText[run.id] || "(không có thay đổi)"}
                      </pre>
                    )}
                  </div>
                )}

                {expanded && run.planning && (
                  <div className="mt-2 rounded-md border border-neutral-800 bg-neutral-950 p-2.5">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                      Planning của lần chạy này
                    </p>
                    <div className="max-h-80 overflow-auto text-sm">
                      <MarkdownView value={run.planning} />
                    </div>
                  </div>
                )}

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
