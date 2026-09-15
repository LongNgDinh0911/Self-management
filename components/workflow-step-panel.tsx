"use client";

import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { STEP_TYPE_META } from "@/lib/workflow-constants";
import type {
  AiStepConfig,
  ConditionStepConfig,
  ActionStepConfig,
} from "@/lib/workflow-constants";
import type { WorkflowStep } from "@/app/generated/prisma/client";

function parseConfig<T>(config: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(config) };
  } catch {
    return fallback;
  }
}

export function StepConfigPanel({
  step,
  onClose,
  onUpdated,
  onDeleted,
}: {
  step: WorkflowStep;
  onClose: () => void;
  onUpdated: (step: WorkflowStep) => void;
  onDeleted: (id: string) => void;
}) {
  const meta = STEP_TYPE_META[step.type];
  const [name, setName] = useState(step.name);
  const [enabled, setEnabled] = useState(step.enabled);
  const [pauseAfter, setPauseAfter] = useState(step.pauseAfter);
  const [saving, setSaving] = useState(false);

  const [aiConfig, setAiConfig] = useState<AiStepConfig>(() =>
    parseConfig(step.config, { prompt: "" })
  );
  const [conditionConfig, setConditionConfig] = useState<ConditionStepConfig>(() =>
    parseConfig(step.config, { command: "", continueOnFailure: false })
  );
  const [actionConfig, setActionConfig] = useState<ActionStepConfig>(() =>
    parseConfig(step.config, { actionType: "create_pr", prTitle: "" })
  );

  async function handleSave() {
    setSaving(true);
    const config =
      step.type === "ai_step"
        ? aiConfig
        : step.type === "condition"
          ? conditionConfig
          : step.type === "action"
            ? actionConfig
            : {};

    const res = await fetch(`/api/workflow-steps/${step.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, enabled, pauseAfter, config }),
    });
    setSaving(false);
    if (res.ok) onUpdated(await res.json());
  }

  async function handleDelete() {
    if (!confirm("Xóa step này?")) return;
    const res = await fetch(`/api/workflow-steps/${step.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(step.id);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
          <meta.icon className="h-4 w-4" style={{ color: meta.color }} /> {meta.label}
        </h3>
        <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200">
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      <label className="mb-1 block text-xs text-neutral-400">Tên step</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mb-4 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
      />

      {step.type === "ai_step" && (
        <>
          <label className="mb-1 block text-xs text-neutral-400">
            Prompt (dùng {"{{task.title}}"}, {"{{task.description}}"}, {"{{task.planning}}"} — nếu
            có node Planning chạy trước trong cùng workflow)
          </label>
          <textarea
            value={aiConfig.prompt}
            onChange={(e) => setAiConfig({ prompt: e.target.value })}
            rows={8}
            className="mb-4 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 font-mono text-xs text-neutral-100 outline-none focus:border-indigo-500"
          />
          <p className="mb-4 text-xs text-neutral-500">
            Chạy bằng Claude Code CLI trong git worktree riêng, không đụng vào working copy chính.
          </p>
        </>
      )}

      {step.type === "condition" && (
        <>
          <label className="mb-1 block text-xs text-neutral-400">Command</label>
          <input
            value={conditionConfig.command}
            onChange={(e) =>
              setConditionConfig((c) => ({ ...c, command: e.target.value }))
            }
            placeholder="npm test"
            className="mb-3 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 font-mono text-xs text-neutral-100 outline-none focus:border-indigo-500"
          />
          <label className="mb-4 flex items-center gap-2 text-xs text-neutral-400">
            <input
              type="checkbox"
              checked={conditionConfig.continueOnFailure}
              onChange={(e) =>
                setConditionConfig((c) => ({ ...c, continueOnFailure: e.target.checked }))
              }
            />
            Vẫn đi tiếp nếu lệnh thất bại
          </label>
        </>
      )}

      {step.type === "planning" && (
        <p className="mb-4 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-2 text-xs text-neutral-500">
          Node cố định — không cần cấu hình. Khi chạy, AI sẽ phân tích task và viết 1 bản kế
          hoạch (plan), tự động lưu vào tab <span className="text-neutral-300">Planning</span>{" "}
          của ticket. Các step AI step phía sau (cùng workflow) có thể dùng{" "}
          <span className="text-neutral-300">{"{{task.planning}}"}</span> trong prompt để đọc
          lại plan này. Nếu task đã có planning từ trước, step này sẽ bỏ qua, không tạo lại.
        </p>
      )}

      {step.type === "action" && (
        <>
          <label className="mb-1 block text-xs text-neutral-400">Loại action</label>
          <select
            disabled
            value={actionConfig.actionType}
            className="mb-3 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 opacity-70"
          >
            <option value="create_pr">Create Pull Request</option>
          </select>

          <label className="mb-1 block text-xs text-neutral-400">
            PR title (tùy chọn, mặc định dùng tên task)
          </label>
          <input
            value={actionConfig.prTitle ?? ""}
            onChange={(e) => setActionConfig((c) => ({ ...c, prTitle: e.target.value }))}
            placeholder="{{task.title}}"
            className="mb-4 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
          />
        </>
      )}

      <label className="mb-2 flex items-center gap-2 text-xs text-neutral-400">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Bật step này
      </label>

      <label className="mb-4 flex items-center gap-2 text-xs text-neutral-400">
        <input
          type="checkbox"
          checked={pauseAfter}
          onChange={(e) => setPauseAfter(e.target.checked)}
        />
        Dừng lại để review &amp; sửa sau khi step này chạy xong
      </label>

      <div className="flex items-center justify-between">
        <button onClick={handleDelete} className="text-sm text-red-400 hover:text-red-300">
          Xóa step
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? "Đang lưu..." : "Lưu step"}
        </button>
      </div>
    </div>
  );
}
