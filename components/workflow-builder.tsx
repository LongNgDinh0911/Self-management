"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { STEP_TYPE_META, RUN_STATUS_META } from "@/lib/workflow-constants";
import type {
  Workflow,
  WorkflowStep,
  WorkflowStepType,
  WorkflowRun,
} from "@/app/generated/prisma/client";
import { StepConfigPanel } from "@/components/workflow-step-panel";

type WorkflowWithSteps = Workflow & { steps: WorkflowStep[] };

const ADDABLE_TYPES: WorkflowStepType[] = ["ai_step", "condition", "action"];
const ACTIVE_STATUSES = new Set(["pending", "running"]);

export function WorkflowBuilder({
  initialWorkflow,
  projectKey,
}: {
  initialWorkflow: WorkflowWithSteps;
  projectKey: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialWorkflow.name);
  const [active, setActive] = useState(initialWorkflow.active);
  const [steps, setSteps] = useState(initialWorkflow.steps);
  const [selected, setSelected] = useState<"trigger" | string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [testRun, setTestRun] = useState<WorkflowRun | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (!testRun || !ACTIVE_STATUSES.has(testRun.status)) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/workflow-runs/${testRun.id}`);
      if (res.ok) setTestRun(await res.json());
    }, 2500);
    return () => clearInterval(interval);
  }, [testRun]);

  async function handleRun() {
    setTriggering(true);
    setShowLog(true);
    const res = await fetch(`/api/workflows/${initialWorkflow.id}/run`, { method: "POST" });
    setTriggering(false);
    if (res.ok) setTestRun(await res.json());
  }

  async function handleStop() {
    if (!testRun) return;
    setStopping(true);
    const res = await fetch(`/api/workflow-runs/${testRun.id}/stop`, { method: "POST" });
    setStopping(false);
    if (res.ok) setTestRun(await res.json());
  }

  async function handleSaveHeader() {
    setSaving(true);
    const res = await fetch(`/api/workflows/${initialWorkflow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, active }),
    });
    setSaving(false);
    if (res.ok) setSavedAt(Date.now());
  }

  async function handleDeleteWorkflow() {
    if (!confirm("Xóa workflow này? Hành động này không thể hoàn tác.")) return;
    setDeleting(true);
    const res = await fetch(`/api/workflows/${initialWorkflow.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      router.push(`/p/${projectKey}/workflows`);
      router.refresh();
    }
  }

  async function handleAddStep(type: WorkflowStepType) {
    const res = await fetch(`/api/workflows/${initialWorkflow.id}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    if (res.ok) {
      const step = await res.json();
      setSteps((prev) => [...prev, step]);
      setSelected(step.id);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active: activeItem, over } = event;
    if (!over || activeItem.id === over.id) return;

    const oldIndex = steps.findIndex((s) => s.id === activeItem.id);
    const newIndex = steps.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(steps, oldIndex, newIndex);
    setSteps(reordered);

    await fetch("/api/workflow-steps/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepIds: reordered.map((s) => s.id) }),
    });
  }

  function handleStepUpdated(updated: WorkflowStep) {
    setSteps((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  function handleStepDeleted(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    setSelected(null);
  }

  const selectedStep = selected && selected !== "trigger" ? steps.find((s) => s.id === selected) : null;

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-base">⚡</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded border border-transparent bg-transparent px-1 text-sm font-semibold text-neutral-100 outline-none focus:border-neutral-700 focus:bg-neutral-800"
            />
            <button
              onClick={() => setActive((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ${
                active ? "bg-emerald-500/10 text-emerald-400" : "bg-neutral-800 text-neutral-500"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-neutral-600"}`}
              />
              {active ? "Active" : "Inactive"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {savedAt && <span className="text-xs text-neutral-500">Đã lưu</span>}
            <button
              onClick={handleSaveHeader}
              disabled={saving}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? "Đang lưu..." : "Save"}
            </button>
            {testRun && ACTIVE_STATUSES.has(testRun.status) ? (
              <button
                onClick={handleStop}
                disabled={stopping}
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
              >
                {stopping ? "Đang dừng..." : "■ Stop"}
              </button>
            ) : (
              <button
                onClick={handleRun}
                disabled={triggering}
                title="Chạy thử workflow này — không gắn với task nào, {{task.*}} trong prompt sẽ để trống"
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {triggering ? "Đang trigger..." : "▷ Run"}
              </button>
            )}
            <button
              onClick={handleDeleteWorkflow}
              disabled={deleting}
              title="Xóa workflow"
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50"
            >
              {deleting ? "Đang xóa..." : "Xóa"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-neutral-800 px-5 py-2">
          {ADDABLE_TYPES.map((type) => {
            const meta = STEP_TYPE_META[type];
            return (
              <button
                key={type}
                onClick={() => handleAddStep(type)}
                className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
              >
                <span style={{ color: meta.color }}>{meta.glyph}</span>+ {meta.label}
              </button>
            );
          })}
        </div>

        {testRun && showLog && (
          <div className="border-b border-neutral-800 px-5 py-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${testRun.status === "running" ? "animate-pulse" : ""}`}
                  style={{ backgroundColor: RUN_STATUS_META[testRun.status].color }}
                />
                <span className="text-xs font-medium text-neutral-300">Test run</span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[11px]"
                  style={{
                    color: RUN_STATUS_META[testRun.status].color,
                    backgroundColor: `${RUN_STATUS_META[testRun.status].color}1a`,
                  }}
                >
                  {RUN_STATUS_META[testRun.status].label}
                </span>
                {testRun.prUrl && (
                  <a
                    href={testRun.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-indigo-400 hover:underline"
                  >
                    PR ↗
                  </a>
                )}
              </div>
              <button
                onClick={() => setShowLog(false)}
                className="text-xs text-neutral-500 hover:text-neutral-300"
              >
                Đóng
              </button>
            </div>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-black/40 p-2.5 font-mono text-xs text-neutral-400">
              {testRun.log || "(chưa có log)"}
            </pre>
          </div>
        )}

        <div className="flex-1 overflow-x-auto p-8">
          <div className="flex items-center gap-0">
            <TriggerCard
              triggerType={initialWorkflow.triggerType}
              selected={selected === "trigger"}
              onClick={() => setSelected("trigger")}
            />

            <DndContext
              id={`workflow-${initialWorkflow.id}`}
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={steps.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
                {steps.map((step) => (
                  <StepCardSortable
                    key={step.id}
                    step={step}
                    selected={selected === step.id}
                    onClick={() => setSelected(step.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </div>

      {(selected === "trigger" || selectedStep) && (
        <div className="w-80 shrink-0 overflow-y-auto border-l border-neutral-800 p-4">
          {selected === "trigger" ? (
            <TriggerPanel triggerType={initialWorkflow.triggerType} onClose={() => setSelected(null)} />
          ) : selectedStep ? (
            <StepConfigPanel
              step={selectedStep}
              onClose={() => setSelected(null)}
              onUpdated={handleStepUpdated}
              onDeleted={handleStepDeleted}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function Arrow() {
  return <div className="h-px w-8 shrink-0 bg-neutral-700" />;
}

function TriggerCard({
  triggerType,
  selected,
  onClick,
}: {
  triggerType: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <>
      <button
        onClick={onClick}
        className={`w-56 shrink-0 rounded-lg border bg-neutral-900 p-3 text-left ${
          selected ? "border-indigo-500" : "border-neutral-800 hover:border-neutral-700"
        }`}
      >
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-teal-400">⚡</span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Trigger
          </span>
        </div>
        <p className="text-sm font-medium text-neutral-100">
          {triggerType === "manual" ? "Manual run" : triggerType}
        </p>
        <p className="mt-1 text-xs text-neutral-500">Bấm nút Run để chạy workflow.</p>
      </button>
      <Arrow />
    </>
  );
}

function TriggerPanel({ triggerType, onClose }: { triggerType: string; onClose: () => void }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
          <span className="text-teal-400">⚡</span> Trigger
        </h3>
        <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200">
          ✕
        </button>
      </div>

      <label className="mb-1 block text-xs text-neutral-400">Loại trigger</label>
      <select
        value={triggerType}
        disabled
        className="mb-2 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 opacity-70"
      >
        <option value="manual">Manual run</option>
      </select>
      <p className="text-xs text-neutral-500">
        Event / cron / webhook trigger sẽ có khi app deploy lên hosting luôn bật (xem backlog).
      </p>
    </div>
  );
}

function StepCardSortable({
  step,
  selected,
  onClick,
}: {
  step: WorkflowStep;
  selected: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const meta = STEP_TYPE_META[step.type];

  return (
    <>
      <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="shrink-0">
        <button
          onClick={onClick}
          className={`w-56 rounded-lg border bg-neutral-900 p-3 text-left ${
            selected ? "border-indigo-500" : "border-neutral-800 hover:border-neutral-700"
          } ${!step.enabled ? "opacity-50" : ""}`}
        >
          <div className="mb-2 flex items-center gap-1.5">
            <span style={{ color: meta.color }}>{meta.glyph}</span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              {meta.label}
            </span>
            {!step.enabled && (
              <span className="ml-auto text-[10px] text-neutral-600">tắt</span>
            )}
          </div>
          <p className="text-sm font-medium text-neutral-100">{step.name}</p>
          <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{meta.description}</p>
        </button>
      </div>
      <Arrow />
    </>
  );
}
