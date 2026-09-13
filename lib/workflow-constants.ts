import type { ComponentType, SVGProps } from "react";
import type { WorkflowStepType, WorkflowRunStatus } from "@/app/generated/prisma/client";
import {
  SparklesIcon,
  CommandLineIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";

export const STEP_TYPE_META: Record<
  WorkflowStepType,
  { label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; color: string; description: string }
> = {
  ai_step: {
    label: "AI step",
    icon: SparklesIcon,
    color: "#6366f1",
    description: "Claude Code chỉnh sửa file trong repo dựa trên prompt.",
  },
  condition: {
    label: "Condition",
    icon: CommandLineIcon,
    color: "#eab308",
    description: "Chạy 1 lệnh (test/lint/build), quyết định có đi tiếp hay không.",
  },
  action: {
    label: "Action",
    icon: CheckCircleIcon,
    color: "#22c55e",
    description: "Hành động cuối, ví dụ tạo Pull Request.",
  },
  planning: {
    label: "Planning",
    icon: ClipboardDocumentListIcon,
    color: "#a855f7",
    description: "Node cố định: AI phân tích task và tạo 1 bản plan, lưu vào tab Planning của ticket.",
  },
};

export const RUN_STATUS_META: Record<WorkflowRunStatus, { label: string; color: string }> = {
  pending: { label: "Pending", color: "#a3a3a3" },
  running: { label: "Running", color: "#3b82f6" },
  success: { label: "Success", color: "#22c55e" },
  failed: { label: "Failed", color: "#ef4444" },
  cancelled: { label: "Cancelled", color: "#f97316" },
  crashed: { label: "Crashed", color: "#dc2626" },
};

export type AiStepConfig = { prompt: string };
export type ConditionStepConfig = { command: string; continueOnFailure: boolean };
export type ActionStepConfig = { actionType: "create_pr"; prTitle?: string };
// Fixed/hardcoded node — no user-editable config, the prompt is baked into
// the runner itself.
export type PlanningStepConfig = Record<string, never>;
