"use client";

import { useState } from "react";
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
import { STATUS_COLUMNS, PRIORITY_META, TASK_TYPE_META } from "@/lib/constants";
import type { Project, Task, TaskStatus } from "@/app/generated/prisma/client";
import { TaskDetailModal } from "@/components/task-detail-modal";
import { ProjectHeader } from "@/components/project-header";
import { CreateTaskModal } from "@/components/create-task-modal";

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
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

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
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
        >
          + Task mới
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
              onTaskClick={setEditingTask}
              onTaskCreated={(task) =>
                setColumns((prev) => ({
                  ...prev,
                  [task.status]: [...prev[task.status], task],
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

      {editingTask && (
        <TaskDetailModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onUpdated={(updated) => {
            setColumns((prev) => {
              const oldStatus = editingTask.status;
              if (updated.status === oldStatus) {
                return {
                  ...prev,
                  [oldStatus]: prev[oldStatus].map((t) => (t.id === updated.id ? updated : t)),
                };
              }
              return {
                ...prev,
                [oldStatus]: prev[oldStatus].filter((t) => t.id !== updated.id),
                [updated.status]: [...prev[updated.status], updated],
              };
            });
            setEditingTask(null);
          }}
          onDeleted={(id) => {
            setColumns((prev) => ({
              ...prev,
              [editingTask.status]: prev[editingTask.status].filter((t) => t.id !== id),
            }));
            setEditingTask(null);
          }}
        />
      )}

      {showCreateModal && (
        <CreateTaskModal
          projectId={project.id}
          defaultStatus="backlog"
          onClose={() => setShowCreateModal(false)}
          onCreated={(task) => {
            setColumns((prev) => ({
              ...prev,
              [task.status]: [...prev[task.status], task],
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
  onTaskCreated: (task: Task) => void;
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
          +
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
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border border-neutral-800 bg-neutral-900 p-2.5 text-left shadow-sm hover:border-neutral-700 ${
        dragging ? "shadow-lg" : ""
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1 text-[11px] text-neutral-500">
          <span style={{ color: type.color }} title={type.label}>
            {type.glyph}
          </span>
          {projectKey}-{task.number}
        </span>
        {task.priority !== "none" && (
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: priority.color }}
            title={priority.label}
          />
        )}
      </div>
      <p className="line-clamp-2 text-sm text-neutral-100">{task.title}</p>
      {(task.estimate != null || task.dueDate || task.jiraKey) && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-500">
          {task.estimate != null && <span>{task.estimate}h</span>}
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
