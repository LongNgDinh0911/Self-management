"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArchiveBoxIcon,
  ArchiveBoxXMarkIcon,
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { STATUS_COLUMNS, PRIORITY_META, TASK_TYPE_META } from "@/lib/constants";
import { RUN_STATUS_META } from "@/lib/workflow-constants";
import { MarkdownEditor } from "@/components/markdown-editor";
import { TaskWorkflowRuns } from "@/components/task-workflow-runs";
import type {
  Project,
  Task,
  TaskPriority,
  TaskStatus,
  TaskType,
  WorkflowRun,
} from "@/app/generated/prisma/client";

type WorkflowOption = { id: string; name: string; active: boolean };
type RunWithWorkflow = WorkflowRun & { workflow: { name: string } };

function prNumberFromUrl(url: string): string | null {
  return url.match(/\/pull\/(\d+)/)?.[1] ?? null;
}

export function TaskDetailPage({
  project,
  task,
  workflows,
  workflowRuns,
}: {
  project: Project;
  task: Task;
  workflows: WorkflowOption[];
  workflowRuns: RunWithWorkflow[];
}) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"detail" | "workflow" | "planning">("detail");
  const pausedRun = workflowRuns.find((r) => r.status === "paused");

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [planning, setPlanning] = useState(task.planning ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [type, setType] = useState<TaskType>(task.type);
  const [dueDate, setDueDate] = useState(
    task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : ""
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [archivedAt, setArchivedAt] = useState<string | null>(
    task.archivedAt ? new Date(task.archivedAt).toISOString() : null
  );
  const [archiving, setArchiving] = useState(false);

  const dirty =
    title !== task.title ||
    description !== task.description ||
    planning !== (task.planning ?? "") ||
    status !== task.status ||
    priority !== task.priority ||
    type !== task.type ||
    dueDate !== (task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "");

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);

    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description,
        planning,
        status,
        priority,
        type,
        dueDate: dueDate === "" ? null : dueDate,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      setError("Không lưu được task");
      return;
    }

    setSaved(true);
    router.refresh();
  }

  async function handleToggleArchive() {
    setArchiving(true);
    const res = await fetch(`/api/tasks/${task.id}/${archivedAt ? "unarchive" : "archive"}`, {
      method: "POST",
    });
    setArchiving(false);
    if (!res.ok) {
      setError(archivedAt ? "Không khôi phục được task" : "Không lưu trữ được task");
      return;
    }
    const updated = await res.json();
    setArchivedAt(updated.archivedAt);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      router.push(`/p/${project.key}`);
      router.refresh();
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-5 flex items-center gap-2 text-sm">
          <Link
            href={`/p/${project.key}`}
            className="flex items-center gap-1 text-neutral-500 hover:text-neutral-300"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Board
          </Link>
          <span className="text-neutral-700">/</span>
          <span className="text-neutral-400">
            {project.key}-{task.number}
          </span>
          {task.jiraKey && (
            <a
              href={task.jiraUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="ml-2 flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-400 hover:underline"
            >
              Jira: {task.jiraKey}
              <ArrowTopRightOnSquareIcon className="h-3 w-3" />
            </a>
          )}
          {pausedRun && (
            <button
              onClick={() => setActiveTab("workflow")}
              className="ml-2 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:underline"
              style={{
                color: RUN_STATUS_META.paused.color,
                backgroundColor: `${RUN_STATUS_META.paused.color}1a`,
              }}
            >
              ⏸ Paused — cần review
            </button>
          )}
          {saved && !dirty && <span className="ml-auto text-xs text-emerald-400">Đã lưu</span>}
        </div>

        {archivedAt && (
          <div className="mb-5 flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs text-amber-400">
              <ArchiveBoxIcon className="h-3.5 w-3.5" />
              Đã lưu trữ lúc {new Date(archivedAt).toLocaleString("vi-VN")} — ẩn khỏi board và
              backlog.
            </span>
            <button
              onClick={handleToggleArchive}
              disabled={archiving}
              className="shrink-0 rounded px-2 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
            >
              {archiving ? "Đang khôi phục..." : "Khôi phục"}
            </button>
          </div>
        )}

        <div className="mb-6 flex items-center gap-1 border-b border-neutral-800">
          <TabButton active={activeTab === "detail"} onClick={() => setActiveTab("detail")}>
            Chi tiết
          </TabButton>
          <TabButton active={activeTab === "workflow"} onClick={() => setActiveTab("workflow")}>
            Workflow
            {workflowRuns.length > 0 && (
              <span className="ml-1.5 rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                {workflowRuns.length}
              </span>
            )}
          </TabButton>
          <TabButton active={activeTab === "planning"} onClick={() => setActiveTab("planning")}>
            Planning
          </TabButton>
        </div>

        {activeTab === "workflow" ? (
          <TaskWorkflowRuns taskId={task.id} workflows={workflows} initialRuns={workflowRuns} />
        ) : (
        <>
        {activeTab === "planning" ? (
          <MarkdownEditor
            value={planning}
            onChange={(v) => {
              setPlanning(v);
              setSaved(false);
            }}
            rows={18}
            placeholder="Chưa có planning. Có thể tự viết tay hoặc chạy workflow có node Planning để AI tạo."
          />
        ) : (
        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="min-w-0 flex-1">
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSaved(false);
              }}
              className="mb-5 w-full rounded-md border border-transparent bg-transparent text-2xl font-semibold text-neutral-100 outline-none focus:border-neutral-700 focus:bg-neutral-900 focus:px-2 focus:py-1"
            />

            <label className="mb-1 block text-xs text-neutral-400">Mô tả</label>
            <MarkdownEditor
              value={description}
              onChange={(v) => {
                setDescription(v);
                setSaved(false);
              }}
              rows={18}
              placeholder="Mô tả... (hỗ trợ Markdown)"
            />
          </div>

          <div className="w-full shrink-0 space-y-4 lg:w-64">
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as TaskStatus);
                  setSaved(false);
                }}
                className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
              >
                {STATUS_COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="PR">
              {task.prUrl ? (
                <div className="flex w-full items-center rounded-md border border-transparent px-2 py-1.5">
                  <a
                    href={task.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-sm text-indigo-400 hover:underline"
                  >
                    PR{prNumberFromUrl(task.prUrl) ? ` #${prNumberFromUrl(task.prUrl)}` : ""}
                    <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                  </a>
                </div>
              ) : (
                <div className="flex w-full items-center rounded-md border border-transparent px-2 py-1.5 text-sm text-neutral-600">
                  —
                </div>
              )}
            </Field>

            <Field label="Priority">
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value as TaskPriority);
                  setSaved(false);
                }}
                className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
              >
                {Object.entries(PRIORITY_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Type">
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as TaskType);
                  setSaved(false);
                }}
                className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
              >
                {Object.entries(TASK_TYPE_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Due date">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  setSaved(false);
                }}
                className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
              />
            </Field>

            <div className="border-t border-neutral-800 pt-3 text-xs text-neutral-600">
              <p>Tạo lúc {new Date(task.createdAt).toLocaleString("vi-VN")}</p>
              <p>Cập nhật {new Date(task.updatedAt).toLocaleString("vi-VN")}</p>
            </div>
          </div>
        </div>
        )}

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <div className="mt-6 flex items-center justify-between border-t border-neutral-800 pt-4">
          {activeTab !== "detail" ? (
            <span />
          ) : !confirmDelete ? (
            <div className="flex items-center gap-3">
              <button
                onClick={handleToggleArchive}
                disabled={archiving}
                className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-200 disabled:opacity-50"
              >
                {archivedAt ? (
                  <ArchiveBoxXMarkIcon className="h-4 w-4" />
                ) : (
                  <ArchiveBoxIcon className="h-4 w-4" />
                )}
                {archiving
                  ? "Đang xử lý..."
                  : archivedAt
                    ? "Khôi phục task"
                    : "Lưu trữ task"}
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-sm text-red-400 hover:text-red-300"
              >
                Xóa task
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-400">Xóa vĩnh viễn task này?</span>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-sm text-neutral-500 hover:text-neutral-300"
              >
                Hủy
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? "Đang xóa..." : "Xác nhận xóa"}
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Link
              href={`/p/${project.key}`}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200"
            >
              Đóng
            </Link>
            <button
              onClick={handleSave}
              disabled={saving || !title.trim() || (!dirty && saved)}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-neutral-400">{label}</label>
      {children}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-indigo-500 text-neutral-100"
          : "border-transparent text-neutral-500 hover:text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}
