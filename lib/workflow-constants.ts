import type { WorkflowStepType, WorkflowRunStatus } from "@/app/generated/prisma/client";

export const STEP_TYPE_META: Record<
  WorkflowStepType,
  { label: string; glyph: string; color: string; description: string }
> = {
  ai_step: {
    label: "AI step",
    glyph: "✦",
    color: "#6366f1",
    description: "Claude Code chỉnh sửa file trong repo dựa trên prompt.",
  },
  condition: {
    label: "Condition",
    glyph: "⌥",
    color: "#eab308",
    description: "Chạy 1 lệnh (test/lint/build), quyết định có đi tiếp hay không.",
  },
  action: {
    label: "Action",
    glyph: "✓",
    color: "#22c55e",
    description: "Hành động cuối, ví dụ tạo Pull Request.",
  },
};

export const RUN_STATUS_META: Record<WorkflowRunStatus, { label: string; color: string }> = {
  pending: { label: "Pending", color: "#a3a3a3" },
  running: { label: "Running", color: "#3b82f6" },
  success: { label: "Success", color: "#22c55e" },
  failed: { label: "Failed", color: "#ef4444" },
};

export type AiStepConfig = { prompt: string };
export type ConditionStepConfig = { command: string; continueOnFailure: boolean };
export type ActionStepConfig = { actionType: "create_pr"; prTitle?: string };
