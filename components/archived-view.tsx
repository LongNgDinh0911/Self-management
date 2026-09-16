"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArchiveBoxXMarkIcon } from "@heroicons/react/24/outline";
import { PRIORITY_META, TASK_TYPE_META } from "@/lib/constants";
import { useTaskUpdates } from "@/lib/use-task-updates";
import { ProjectHeader } from "@/components/project-header";
import type { Project, Task } from "@/app/generated/prisma/client";

function sortByArchivedAtDesc(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const bTime = b.archivedAt ? new Date(b.archivedAt).getTime() : 0;
    const aTime = a.archivedAt ? new Date(a.archivedAt).getTime() : 0;
    return bTime - aTime;
  });
}

export function ArchivedView({
  project,
  initialTasks,
}: {
  project: Project;
  initialTasks: Task[];
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Keeps this view in sync if a task gets archived/unarchived from another
  // tab or the board while this page is open — otherwise a stale entry could
  // sit here after being restored elsewhere, or a freshly-archived task
  // wouldn't show up until a manual refresh.
  useTaskUpdates<Task>(project.id, (updatedTask) => {
    setTasks((prev) => {
      const rest = prev.filter((t) => t.id !== updatedTask.id);
      return updatedTask.archivedAt ? sortByArchivedAtDesc([...rest, updatedTask]) : rest;
    });
    setSelected((prev) => {
      if (!prev.has(updatedTask.id)) return prev;
      const next = new Set(prev);
      next.delete(updatedTask.id);
      return next;
    });
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === tasks.length ? new Set() : new Set(tasks.map((t) => t.id))));
  }

  async function unarchiveOne(id: string) {
    setBusy(true);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await fetch(`/api/tasks/${id}/unarchive`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  async function unarchiveSelected() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    setBusy(true);
    setTasks((prev) => prev.filter((t) => !selected.has(t.id)));
    setSelected(new Set());
    await fetch("/api/tasks/archive-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds: ids, archived: false }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <ProjectHeader project={project} />

      <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-2">
        <label className="flex items-center gap-2 text-xs text-neutral-500">
          <input
            type="checkbox"
            checked={tasks.length > 0 && selected.size === tasks.length}
            onChange={toggleAll}
            disabled={tasks.length === 0}
            className="h-3.5 w-3.5 rounded border-neutral-700 bg-neutral-800"
          />
          {selected.size > 0 ? `${selected.size} đã chọn` : `${tasks.length} task đã lưu trữ`}
        </label>
        {selected.size > 0 && (
          <button
            onClick={unarchiveSelected}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <ArchiveBoxXMarkIcon className="h-3.5 w-3.5" />
            Khôi phục ({selected.size})
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {tasks.length === 0 ? (
          <p className="text-sm text-neutral-600">Chưa có task nào được lưu trữ.</p>
        ) : (
          <div className="flex flex-col divide-y divide-neutral-900 overflow-hidden rounded-lg border border-neutral-800">
            {tasks.map((task) => {
              const type = TASK_TYPE_META[task.type];
              const priority = PRIORITY_META[task.priority];
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 bg-neutral-900/40 px-3 py-2.5"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(task.id)}
                    onChange={() => toggle(task.id)}
                    className="h-3.5 w-3.5 shrink-0 rounded border-neutral-700 bg-neutral-800"
                  />
                  <Link
                    href={`/p/${project.key}/t/${task.number}`}
                    className="flex min-w-0 flex-1 items-center gap-2"
                  >
                    <type.icon
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: type.color }}
                      aria-label={type.label}
                    />
                    <span className="shrink-0 text-xs text-neutral-500">
                      {project.key}-{task.number}
                    </span>
                    <span className="truncate text-sm text-neutral-200">{task.title}</span>
                  </Link>
                  {task.priority !== "none" && (
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: `${priority.color}1A`, color: priority.color }}
                    >
                      {priority.label}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-neutral-600">
                    Lưu trữ{" "}
                    {task.archivedAt ? new Date(task.archivedAt).toLocaleDateString("vi-VN") : ""}
                  </span>
                  <button
                    onClick={() => unarchiveOne(task.id)}
                    disabled={busy}
                    className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-50"
                    title="Khôi phục"
                  >
                    <ArchiveBoxXMarkIcon className="h-3.5 w-3.5" />
                    Khôi phục
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
