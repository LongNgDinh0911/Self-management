import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { WorkflowStepType } from "@/app/generated/prisma/client";

const DEFAULT_NAME: Record<WorkflowStepType, string> = {
  ai_step: "AI step",
  condition: "Condition",
  action: "Action",
  planning: "Planning",
};

const DEFAULT_CONFIG: Record<WorkflowStepType, object> = {
  ai_step: { prompt: "" },
  condition: { command: "", continueOnFailure: false },
  action: { actionType: "create_pr" },
  planning: {},
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workflowId } = await params;
  const body = await request.json();
  const type = body.type as WorkflowStepType;
  const parentStepId = typeof body.parentStepId === "string" ? body.parentStepId : null;

  if (!type || !(type in DEFAULT_NAME)) {
    return NextResponse.json({ error: "Loại step không hợp lệ" }, { status: 400 });
  }

  // Sibling order: position among the steps sharing this same parent (or
  // among the root steps, if parentStepId is null), not a workflow-wide
  // sequence — a tree can have several unrelated "last" steps at once.
  const lastSibling = await prisma.workflowStep.findFirst({
    where: { workflowId, parentStepId },
    orderBy: { order: "desc" },
  });

  const step = await prisma.workflowStep.create({
    data: {
      workflowId,
      parentStepId,
      type,
      name: DEFAULT_NAME[type],
      order: (lastSibling?.order ?? -1) + 1,
      config: JSON.stringify(DEFAULT_CONFIG[type]),
    },
  });

  return NextResponse.json(step, { status: 201 });
}
