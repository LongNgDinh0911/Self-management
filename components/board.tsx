"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlusIcon } from "@heroicons/react/24/outline";
import { STATUS_COLUMNS, PRIORITY_META, TASK_TYPE_META } from "@/lib/constants";
import { RUN_STATUS_META } from "@/lib/workflow-constants";
import { useWorkflowRunUpdates } from "@/lib/use-workflow-run-updates";
import { useTaskUpdates } from "@/lib/use-task-updates";
import type {
  Project,
  Task as PrismaTask,
  TaskStatus,
  WorkflowRun,
} from "@/app/generated/prisma/client";
import { ProjectHeader } from "@/components/project-header";
import { CreateTaskModal } from "@/components/create-task-modal";

type RunWithWorkflow = WorkflowRun & { workflow: { name: string } };
type Task = PrismaTask & { workflowRuns: RunWithWorkflow[] };

const ACTIVE_RUN_STATUSES = new Set(["pending", "running"]);

type ColumnsState = Record<TaskStatus, Task[]>;

function groupTasks(tasks: Task[]): ColumnsState {
  const grouped = Object.fromEntries(
    STATUS_COLUMNS.map((c) => [c.key, [] as Task[]])
  ) as ColumnsState;
  for (const task of tasks) {
    grouped[task.status].push(task);
  }
  for (const key of Object.keys(grouped) as TaskStatus[]) {
    grouped[key].sort((a, b) => a.order - b.order);
  }
  return grouped;
}

export function Board({
  project,
  initialTasks,
}: {
  project: Project;
  initialTasks: Task[];
}) {
  const router = useRouter();
  const [columns, setColumns] = useState<ColumnsState>(() => groupTasks(initialTasks));
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Re-derive columns whenever the server hands us a new initialTasks
  // snapshot (e.g. after router.refresh()), so a fresh page/socket-driven
  // fetch actually reaches the board's local drag-and-drop state.
  const [prevInitialTasks, setPrevInitialTasks] = useState(initialTasks);
  if (initialTasks !== prevInitialTasks) {
    setPrevInitialTasks(initialTasks);
    setColumns(groupTasks(initialTasks));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const activeRunIds = Object.values(columns)
    .flat()
    .flatMap((task) => task.workflowRuns)
    .filter((run) => ACTIVE_RUN_STATUSES.has(run.status))
    .map((run) => run.id);

  useWorkflowRunUpdates<RunWithWorkflow>(activeRunIds, (updatedRun) => {
    if (!updatedRun.taskId) return;
    setColumns((prev) => {
      const status = (Object.keys(prev) as TaskStatus[]).find((s) =>
        prev[s].some((t) => t.id === updatedRun.taskId)
      );
      if (!status) return prev;
      return {
        ...prev,
        [status]: prev[status].map((t) =>
          t.id === updatedRun.taskId ? { ...t, workflowRuns: [updatedRun] } : t
        ),
      };
    });
  });

  useTaskUpdates<Task>(project.id, (updatedTask) => {
    setColumns((prev) => {
      let existing: Task | undefined;
      for (const status of Object.keys(prev) as TaskStatus[]) {
        const match = prev[status].find((t) => t.id === updatedTask.id);
        if (match) {
          existing = match;
          break;
        }
      }
      // Ignore stale events (e.g. a reconnect snapshot racing a more recent
      // optimistic update already applied locally) — updatedAt only moves
      // forward on the server, so an older value here means this event is
      // out of order and should be dropped rather than clobbering newer state.
      if (
        existing &&
        new Date(existing.updatedAt).getTime() > new Date(updatedTask.updatedAt).getTime()
      ) {
        return prev;
      }

      const next = { ...prev };
      for (const status of Object.keys(next) as TaskStatus[]) {
        next[status] = next[status].filter((t) => t.id !== updatedTask.id);
      }
      next[updatedTask.status] = [...next[updatedTask.status], updatedTask].sort(
        (a, b) => a.order - b.order
      );
      return next;
    });
  });

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [router]);

  function findContainer(id: string): TaskStatus | undefined {
    if (STATUS_COLUMNS.some((c) => c.key === id)) return id as TaskStatus;
    return (Object.keys(columns) as TaskStatus[]).find((status) =>
      columns[status].some((t) => t.id === id)
    );
  }

  function handleDragStart(event: DragStartEvent) {
    const task = Object.values(columns)
      .flat()
      .find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeContainer = findContainer(String(active.id));
    const overContainer = findContainer(String(over.id));
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setColumns((prev) => {
      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const activeIndex = activeItems.findIndex((t) => t.id === active.id);
      const overIndex = overItems.findIndex((t) => t.id === over.id);
      if (activeIndex === -1) return prev;

      const movedTask = { ...activeItems[activeIndex], status: overContainer };
      const newActiveItems = activeItems.filter((t) => t.id !== active.id);
      const insertAt = overIndex >= 0 ? overIndex : overItems.length;
      const newOverItems = [
        ...overItems.slice(0, insertAt),
        movedTask,
        ...overItems.slice(insertAt),
      ];

      return {
        ...prev,
        [activeContainer]: newActiveItems,
        [overContainer]: newOverItems,
      };
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    const activeContainer = findContainer(String(active.id));
    const overContainer = findContainer(String(over.id));
    if (!activeContainer || !overContainer) return;

    let finalColumns = columns;

    if (activeContainer === overContainer) {
      const items = columns[activeContainer];
      const oldIndex = items.findIndex((t) => t.id === active.id);
      const newIndex = items.findIndex((t) => t.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        finalColumns = { ...columns, [activeContainer]: arrayMove(items, oldIndex, newIndex) };
        setColumns(finalColumns);
      }
    }

    const affected = new Set([activeContainer, overContainer]);
    await Promise.all(
      Array.from(affected).map((status) =>
        fetch("/api/tasks/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, taskIds: finalColumns[status].map((t) => t.id) }),
        })
      )
    );
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <ProjectHeader project={project} />

      <div className="flex justify-end border-b border-neutral-800 px-5 py-2">
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Task mới
        </button>
      </div>

      <DndContext
        id={`board-${project.id}`}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 gap-4 overflow-x-auto p-5">
          {STATUS_COLUMNS.map((column) => (
            <Column
              key={column.key}
              status={column.key}
              label={column.label}
              tasks={columns[column.key]}
              projectId={project.id}
              projectKey={project.key}
              onTaskClick={(task) => router.push(`/p/${project.key}/t/${task.number}`)}
              onTaskCreated={(task) =>
                setColumns((prev) => ({
                  ...prev,
                  [task.status]: [...prev[task.status], { ...task, workflowRuns: [] }],
                }))
              }
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <TaskCard task={activeTask} projectKey={project.key} onClick={() => {}} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>

      {showCreateModal && (
        <CreateTaskModal
          projectId={project.id}
          defaultStatus="backlog"
          jiraSite={project.jiraSite}
          onClose={() => setShowCreateModal(false)}
          onCreated={(task) => {
            setColumns((prev) => ({
              ...prev,
              [task.status]: [...prev[task.status], { ...task, workflowRuns: [] }],
            }));
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}

function Column({
  status,
  label,
  tasks,
  projectId,
  projectKey,
  onTaskClick,
  onTaskCreated,
}: {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  projectId: string;
  projectKey: string;
  onTaskClick: (task: Task) => void;
  onTaskCreated: (task: PrismaTask) => void;
}) {
  const { setNodeRef } = useDroppable({ id: status });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  async function createTask() {
    const trimmed = title.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed, status }),
    });
    if (res.ok) {
      onTaskCreated(await res.json());
      setTitle("");
    }
  }

  return (
    <div ref={setNodeRef} className="flex w-72 shrink-0 flex-col rounded-lg bg-neutral-900/50">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-300">{label}</span>
          <span className="text-xs text-neutral-600">{tasks.length}</span>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded px-1.5 text-sm text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              projectKey={projectKey}
              onClick={() => onTaskClick(task)}
            />
          ))}
        </SortableContext>

        {adding && (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (!title.trim()) setAdding(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setAdding(false);
                setTitle("");
              } else if (e.key === "Enter") {
                e.preventDefault();
                createTask();
              }
            }}
            placeholder="Tên task..."
            className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
          />
        )}
      </div>
    </div>
  );
}

function SortableTaskCard({
  task,
  projectKey,
  onClick,
}: {
  task: Task;
  projectKey: string;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} projectKey={projectKey} onClick={onClick} />
    </div>
  );
}

function TaskCard({
  task,
  projectKey,
  onClick,
  dragging,
}: {
  task: Task;
  projectKey: string;
  onClick: () => void;
  dragging?: boolean;
}) {
  const priority = PRIORITY_META[task.priority];
  const type = TASK_TYPE_META[task.type];
  const latestRun = task.workflowRuns[0];
  const runMeta = latestRun ? RUN_STATUS_META[latestRun.status] : null;
  const runActive = latestRun ? ACTIVE_RUN_STATUSES.has(latestRun.status) : false;
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border border-neutral-800 bg-neutral-900 p-2.5 text-left shadow-sm hover:border-neutral-700 ${
        dragging ? "shadow-lg" : ""
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1 text-[11px] text-neutral-500">
          <type.icon className="h-3 w-3 shrink-0" style={{ color: type.color }} aria-label={type.label} />
          {projectKey}-{task.number}
          {runMeta && (
            <span className="relative ml-1 inline-flex h-1.5 w-1.5 shrink-0" title={runMeta.label}>
              {runActive && (
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                  style={{ backgroundColor: runMeta.color }}
                />
              )}
              <span
                className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                  runActive ? "animate-pulse" : ""
                }`}
                style={{ backgroundColor: runMeta.color }}
              />
            </span>
          )}
        </span>
        {task.priority !== "none" && (
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: `${priority.color}1A`,
              color: priority.color,
            }}
          >
            {priority.label}
          </span>
        )}
      </div>
      <p className="line-clamp-2 text-sm text-neutral-100">{task.title}</p>
      {(task.dueDate || task.jiraKey) && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-500">
          {task.dueDate && <span>{new Date(task.dueDate).toLocaleDateString("vi-VN")}</span>}
          {task.jiraKey && (
            <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-400">
              {task.jiraKey}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
