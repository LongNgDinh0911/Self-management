import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeWorkflowRun } from "@/lib/workflow-runner";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workflowId } = await params;

  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow) {
    return NextResponse.json({ error: "Không tìm thấy workflow" }, { status: 404 });
  }

  // Test run from the builder — not tied to a task, so {{task.*}} in step
  // prompts render as empty strings. Good enough to sanity-check the repo
  // config and step sequencing before wiring the workflow to real tasks.
  const run = await prisma.workflowRun.create({
    data: { workflowId, taskId: null, status: "pending" },
  });

  executeWorkflowRun(run.id).catch((err) => {
    console.error(`[workflow-run ${run.id}] unhandled error`, err);
  });

  return NextResponse.json(run, { status: 201 });
}
