"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  BoltIcon,
  PlayIcon,
  StopIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { STEP_TYPE_META, RUN_STATUS_META } from "@/lib/workflow-constants";
import { useWorkflowRunUpdates } from "@/lib/use-workflow-run-updates";
import type {
  Workflow,
  WorkflowStep,
  WorkflowStepType,
  WorkflowRun,
} from "@/app/generated/prisma/client";
import { StepConfigPanel } from "@/components/workflow-step-panel";

type WorkflowWithSteps = Workflow & { steps: WorkflowStep[] };

const ADDABLE_TYPES: WorkflowStepType[] = ["ai_step", "condition", "action", "planning"];
const ACTIVE_STATUSES = new Set(["pending", "running"]);

// Synthetic node id for the trigger, which isn't a real WorkflowStep row —
// steps with parentStepId === null render as its children.
const TRIGGER_ID = "__trigger__";
const NODE_WIDTH = 224;
const NODE_HEIGHT = 88;

/**
 * Node positions are always derived from the parentStepId tree via dagre,
 * never stored — there's no manual layout to persist, so branching a step
 * (or re-parenting one by dragging a new connection) just works without a
 * separate "save positions" step.
 */
function layoutTree(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 28, ranksep: 72 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } };
  });
}

function AddChildButton({ onAdd }: { onAdd: (type: WorkflowStepType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Thêm step con"
        className="flex h-5 w-5 items-center justify-center rounded-full border border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-indigo-500 hover:text-indigo-400"
      >
        <PlusIcon className="h-3 w-3" />
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-1/2 top-6 z-10 flex -translate-x-1/2 flex-col gap-0.5 rounded-md border border-neutral-700 bg-neutral-900 p-1 shadow-lg"
        >
          {ADDABLE_TYPES.map((type) => {
            const meta = STEP_TYPE_META[type];
            return (
              <button
                key={type}
                onClick={() => {
                  onAdd(type);
                  setOpen(false);
                }}
                className="flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 text-left text-xs text-neutral-300 hover:bg-neutral-800"
              >
                <meta.icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                {meta.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type TriggerNodeData = {
  triggerType: string;
  onAddChild: (type: WorkflowStepType) => void;
};

function TriggerNode({ data, selected }: NodeProps<Node<TriggerNodeData>>) {
  return (
    <div
      className={`w-56 rounded-lg border bg-neutral-900 p-3 text-left ${
        selected ? "border-indigo-500" : "border-neutral-800"
      }`}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <BoltIcon className="h-3.5 w-3.5 shrink-0 text-teal-400" />
        <span className="truncate text-[11px] font-medium uppercase tracking-wide text-neutral-500">
          Trigger
        </span>
        <div className="ml-auto">
          <AddChildButton onAdd={data.onAddChild} />
        </div>
      </div>
      <p className="text-sm font-medium text-neutral-100">
        {data.triggerType === "manual" ? "Manual run" : data.triggerType}
      </p>
      <p className="mt-1 text-xs text-neutral-500">Bấm nút Run để chạy workflow.</p>
      <Handle type="source" position={Position.Right} className="!bg-neutral-600" />
    </div>
  );
}

type StepNodeData = {
  step: WorkflowStep;
  onAddChild: (type: WorkflowStepType) => void;
};

function StepNode({ data, selected }: NodeProps<Node<StepNodeData>>) {
  const { step } = data;
  const meta = STEP_TYPE_META[step.type];
  return (
    <div
      className={`w-56 rounded-lg border bg-neutral-900 p-3 text-left ${
        selected ? "border-indigo-500" : "border-neutral-800 hover:border-neutral-700"
      } ${!step.enabled ? "opacity-50" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-neutral-600" />
      <div className="mb-2 flex items-center gap-1.5">
        <meta.icon className="h-3.5 w-3.5 shrink-0" style={{ color: meta.color }} />
        <span className="truncate text-[11px] font-medium uppercase tracking-wide text-neutral-500">
          {meta.label}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {!step.enabled && <span className="text-[10px] text-neutral-600">tắt</span>}
          <AddChildButton onAdd={data.onAddChild} />
        </div>
      </div>
      <p className="text-sm font-medium text-neutral-100">{step.name}</p>
      <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{meta.description}</p>
      <Handle type="source" position={Position.Right} className="!bg-neutral-600" />
    </div>
  );
}

const nodeTypes = { trigger: TriggerNode, step: StepNode };

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
  const [runError, setRunError] = useState<string | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);

  const activeTestRunIds =
    testRun && ACTIVE_STATUSES.has(testRun.status) ? [testRun.id] : [];

  useWorkflowRunUpdates<WorkflowRun>(activeTestRunIds, (updated) => {
    setTestRun((prev) => (prev && prev.id === updated.id ? updated : prev));
  });

  async function handleRun() {
    setTriggering(true);
    setRunError(null);
    const res = await fetch(`/api/workflows/${initialWorkflow.id}/run`, { method: "POST" });
    setTriggering(false);
    if (res.ok) {
      setShowLog(true);
      setTestRun(await res.json());
    } else {
      const body = await res.json().catch(() => null);
      setRunError(body?.error ?? "Không trigger được workflow");
    }
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

  const handleAddStep = useCallback(
    async (type: WorkflowStepType, parentStepId: string | null) => {
      const res = await fetch(`/api/workflows/${initialWorkflow.id}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, parentStepId }),
      });
      if (res.ok) {
        const step = await res.json();
        setSteps((prev) => [...prev, step]);
        setSelected(step.id);
      }
    },
    [initialWorkflow.id]
  );

  const handleConnect = useCallback(async (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    setTreeError(null);
    const parentStepId = connection.source === TRIGGER_ID ? null : connection.source;
    const res = await fetch(`/api/workflow-steps/${connection.target}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentStepId }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSteps((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } else {
      const body = await res.json().catch(() => null);
      setTreeError(body?.error ?? "Không nối được step");
    }
  }, []);

  function handleStepUpdated(updated: WorkflowStep) {
    setSteps((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  function handleStepDeleted(id: string) {
    // The API cascades the delete to the whole subtree — drop it locally too.
    setSteps((prev) => {
      const toRemove = new Set([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const s of prev) {
          if (s.parentStepId && toRemove.has(s.parentStepId) && !toRemove.has(s.id)) {
            toRemove.add(s.id);
            grew = true;
          }
        }
      }
      return prev.filter((s) => !toRemove.has(s.id));
    });
    setSelected(null);
  }

  const selectedStep =
    selected && selected !== "trigger" ? steps.find((s) => s.id === selected) : null;

  const { nodes, edges } = useMemo(() => {
    const rawNodes: Node[] = [
      {
        id: TRIGGER_ID,
        type: "trigger",
        position: { x: 0, y: 0 },
        selected: selected === "trigger",
        data: {
          triggerType: initialWorkflow.triggerType,
          onAddChild: (type: WorkflowStepType) => handleAddStep(type, null),
        } satisfies TriggerNodeData,
      },
      ...steps.map(
        (step): Node => ({
          id: step.id,
          type: "step",
          position: { x: 0, y: 0 },
          selected: selected === step.id,
          data: {
            step,
            onAddChild: (type: WorkflowStepType) => handleAddStep(type, step.id),
          } satisfies StepNodeData,
        })
      ),
    ];
    const rawEdges: Edge[] = steps.map((step) => ({
      id: `${step.parentStepId ?? TRIGGER_ID}->${step.id}`,
      source: step.parentStepId ?? TRIGGER_ID,
      target: step.id,
      markerEnd: { type: MarkerType.ArrowClosed, color: "#525252", width: 16, height: 16 },
      style: { stroke: "#525252" },
    }));
    return { nodes: layoutTree(rawNodes, rawEdges), edges: rawEdges };
  }, [steps, selected, initialWorkflow.triggerType, handleAddStep]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <BoltIcon className="h-4 w-4 text-teal-400" />
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
                className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
              >
                {stopping ? (
                  "Đang dừng..."
                ) : (
                  <>
                    <StopIcon className="h-3.5 w-3.5" />
                    Stop
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleRun}
                disabled={triggering}
                title="Chạy thử workflow này — không gắn với task nào, {{task.*}} trong prompt sẽ để trống"
                className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {triggering ? (
                  "Đang trigger..."
                ) : (
                  <>
                    <PlayIcon className="h-3.5 w-3.5" />
                    Run
                  </>
                )}
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

        {runError && (
          <p className="border-b border-neutral-800 bg-red-500/10 px-5 py-2 text-xs text-red-400">
            {runError}
          </p>
        )}
        {treeError && (
          <p className="border-b border-neutral-800 bg-red-500/10 px-5 py-2 text-xs text-red-400">
            {treeError}
          </p>
        )}

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
                    className="flex items-center gap-1 text-[11px] text-indigo-400 hover:underline"
                  >
                    PR
                    <ArrowTopRightOnSquareIcon className="h-3 w-3" />
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

        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelected(node.id === TRIGGER_ID ? "trigger" : node.id)}
            onPaneClick={() => setSelected(null)}
            onConnect={handleConnect}
            nodesDraggable={false}
            fitView
            proOptions={{ hideAttribution: true }}
            colorMode="dark"
          >
            <Background color="#262626" gap={20} />
            <Controls
              showInteractive={false}
              className="[&>button]:!border-neutral-800 [&>button]:!bg-neutral-900 [&>button]:!fill-neutral-400 [&>button]:hover:!bg-neutral-800"
            />
            <MiniMap
              pannable
              zoomable
              className="!bg-neutral-900"
              maskColor="rgba(0,0,0,0.65)"
              nodeColor="#404040"
            />
          </ReactFlow>
        </div>
      </div>

      {(selected === "trigger" || selectedStep) && (
        <div className="w-80 shrink-0 overflow-y-auto border-l border-neutral-800 p-4">
          {selected === "trigger" ? (
            <TriggerPanel
              triggerType={initialWorkflow.triggerType}
              onClose={() => setSelected(null)}
            />
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

function TriggerPanel({
  triggerType,
  onClose,
}: {
  triggerType: string;
  onClose: () => void;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
          <BoltIcon className="h-4 w-4 text-teal-400" /> Trigger
        </h3>
        <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200">
          <XMarkIcon className="h-4 w-4" />
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
