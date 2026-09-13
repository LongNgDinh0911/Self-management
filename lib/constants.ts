import type { TaskPriority, TaskStatus } from "@/app/generated/prisma/client";

export const STATUS_COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "in_review", label: "In Review" },
  { key: "done", label: "Done" },
];

export const PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  none: { label: "No priority", color: "#525252" },
  low: { label: "Low", color: "#3b82f6" },
  medium: { label: "Medium", color: "#eab308" },
  high: { label: "High", color: "#f97316" },
  urgent: { label: "Urgent", color: "#ef4444" },
};

export const PROJECT_COLORS = [
  "#6366f1",
  "#22c55e",
  "#ec4899",
  "#f59e0b",
  "#06b6d4",
  "#a855f7",
];
