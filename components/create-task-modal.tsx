"use client";

import { useState, type FormEvent } from "react";
import { STATUS_COLUMNS, PRIORITY_META, TASK_TYPE_META } from "@/lib/constants";
import { parseJiraRef } from "@/lib/jira";
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
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchedFrom, setFetchedFrom] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jiraParsed = parseJiraRef(jiraRef, jiraSite);
  const canSubmit =
    mode === "manual" ? title.trim().length > 0 : title.trim().length > 0 && !!jiraParsed.jiraKey;

  function openJiraConnectPopup(): Promise<boolean> {
    return new Promise((resolve) => {
      const popup = window.open(
        "/api/auth/jira/connect?popup=1",
        "jira-oauth",
        "width=560,height=720"
      );
      if (!popup) {
        resolve(false);
        return;
      }

      let settled = false;
      function handleMessage(e: MessageEvent) {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type !== "jira-oauth") return;
        settled = true;
        window.removeEventListener("message", handleMessage);
        clearInterval(poll);
        resolve(!!e.data.ok);
      }
      window.addEventListener("message", handleMessage);

      // fallback: user closed the popup without finishing the flow
      const poll = setInterval(() => {
        if (popup.closed && !settled) {
          clearInterval(poll);
          window.removeEventListener("message", handleMessage);
          resolve(false);
        }
      }, 500);
    });
  }

  async function attemptFetchFromJira(site: string, key: string) {
    const res = await fetch("/api/jira/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jiraSite: site, jiraKey: key }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async function handleFetchFromJira() {
    setFetchError(null);
    if (!jiraParsed.jiraKey) {
      setFetchError("Chưa nhận diện được mã ticket từ nội dung này");
      return;
    }
    const site = jiraParsed.jiraUrl ? new URL(jiraParsed.jiraUrl).host : jiraSite;
    if (!site) {
      setFetchError("Chưa biết Jira site — dán link đầy đủ, hoặc cấu hình Jira site trong Settings");
      return;
    }

    setFetching(true);
    let { ok, data } = await attemptFetchFromJira(site, jiraParsed.jiraKey);

    if (!ok && data.needsConnect) {
      const connected = await openJiraConnectPopup();
      if (connected) {
        ({ ok, data } = await attemptFetchFromJira(site, jiraParsed.jiraKey));
      } else {
        setFetching(false);
        setFetchError("Chưa kết nối được Jira — thử lại nút Fetch sau khi đăng nhập.");
        return;
      }
    }

    setFetching(false);

    if (!ok) {
      setFetchError(data.error ?? "Không fetch được từ Jira");
      return;
    }

    setTitle(data.title);
    setDescription(data.description);
    setType(data.type);
    setPriority(data.priority);
    setStatus(data.status);
    setFetchedFrom(jiraParsed.jiraKey);
  }

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
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
      >
        <h2 className="mb-4 text-sm font-semibold text-neutral-100">Tạo task mới</h2>

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
            <div className="flex gap-2">
              <input
                autoFocus
                value={jiraRef}
                onChange={(e) => {
                  setJiraRef(e.target.value);
                  setFetchedFrom(null);
                }}
                placeholder={
                  jiraSite
                    ? `${jiraSite}/browse/PROJ-123 hoặc PROJ-123`
                    : "https://.../browse/PROJ-123"
                }
                className="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleFetchFromJira}
                disabled={fetching || !jiraParsed.jiraKey}
                className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {fetching ? "Đang lấy..." : "Fetch từ Jira"}
              </button>
            </div>
            {fetchError && <p className="mt-2 text-xs text-red-400">{fetchError}</p>}
            {fetchedFrom && !fetchError && (
              <p className="mt-2 text-xs text-emerald-400">
                Đã lấy dữ liệu từ {fetchedFrom} — kiểm tra lại các trường bên dưới trước khi tạo.
              </p>
            )}
          </div>
        )}

        <label className="mb-1 block text-xs text-neutral-400">Tiêu đề</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tên task..."
          className="mb-4 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
        />

        <label className="mb-1 block text-xs text-neutral-400">Mô tả</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Mô tả..."
          rows={4}
          className="mb-4 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-200 outline-none focus:border-indigo-500"
        />

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
