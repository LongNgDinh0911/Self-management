"use client";

import { useState, type FormEvent } from "react";
import { STATUS_COLUMNS, PRIORITY_META, TASK_TYPE_META } from "@/lib/constants";
import { parseJiraRef } from "@/lib/jira";
import { MarkdownEditor } from "@/components/markdown-editor";
import type { Task, TaskPriority, TaskStatus, TaskType } from "@/app/generated/prisma/client";

type Mode = "manual" | "jira";

export function CreateTaskModal({
  projectId,
  defaultStatus,
  jiraSite,
  onClose,
  onCreated,
}: {
  projectId: string;
  defaultStatus: TaskStatus;
  jiraSite?: string | null;
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const [mode, setMode] = useState<Mode>("manual");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TaskType>("task");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [estimate, setEstimate] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [jiraRef, setJiraRef] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jiraParsed = parseJiraRef(jiraRef, jiraSite);
  const canSubmit =
    mode === "manual" ? title.trim().length > 0 : title.trim().length > 0 && !!jiraParsed.jiraKey;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description,
        type,
        status,
        priority,
        estimate: estimate === "" ? null : Number(estimate),
        dueDate: dueDate || null,
        ...(mode === "jira" ? { jiraKey: jiraParsed.jiraKey, jiraUrl: jiraParsed.jiraUrl } : {}),
      }),
    });

    setSaving(false);

    if (!res.ok) {
      setError("Không tạo được task");
      return;
    }
    onCreated(await res.json());
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl"
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-100">Tạo task mới</h2>

        <div className="mb-5 flex gap-1 rounded-md bg-neutral-800 p-1">
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition ${
              mode === "manual" ? "bg-neutral-700 text-neutral-100" : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Thủ công
          </button>
          <button
            type="button"
            onClick={() => setMode("jira")}
            className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition ${
              mode === "jira" ? "bg-neutral-700 text-neutral-100" : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Từ Jira link
          </button>
        </div>

        {mode === "jira" && (
          <div className="mb-4">
            <label className="mb-1 block text-xs text-neutral-400">Jira ticket (link hoặc mã)</label>
            <input
              autoFocus
              value={jiraRef}
              onChange={(e) => setJiraRef(e.target.value)}
              placeholder={
                jiraSite
                  ? `${jiraSite}/browse/PROJ-123 hoặc PROJ-123`
                  : "https://.../browse/PROJ-123"
              }
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
            />
            <p className="mt-2 rounded-md bg-neutral-800/60 px-3 py-2 text-xs text-neutral-400">
              Chỉ lưu tham chiếu — điền title/mô tả/priority bên dưới bằng tay, hoặc nhờ Claude Code
              (trong chat) mở ticket này qua Chrome và điền giúp trước khi bạn tạo task.
            </p>
          </div>
        )}

        <label className="mb-1 block text-xs text-neutral-400">Tiêu đề</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tên task..."
          className="mb-4 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-base text-neutral-100 outline-none focus:border-indigo-500"
        />

        <label className="mb-1 block text-xs text-neutral-400">Mô tả</label>
        <div className="mb-4">
          <MarkdownEditor value={description} onChange={setDescription} rows={12} placeholder="Mô tả... (hỗ trợ Markdown)" />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TaskType)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
            >
              {Object.entries(TASK_TYPE_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.glyph} {meta.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-neutral-400">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
            >
              {STATUS_COLUMNS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-neutral-400">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
            >
              {Object.entries(PRIORITY_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-neutral-400">Estimate (giờ)</label>
            <input
              type="number"
              min={0}
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-neutral-400">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        <div className="mt-auto flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "Đang tạo..." : "Tạo task"}
          </button>
        </div>
      </form>
    </div>
  );
}
