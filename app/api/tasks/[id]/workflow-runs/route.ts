import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeWorkflowRun } from "@/lib/workflow-runner";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const runs = await prisma.workflowRun.findMany({
    where: { taskId },
    orderBy: { startedAt: "desc" },
    include: { workflow: { select: { name: true } } },
  });
  return NextResponse.json(runs);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const body = await request.json();
  const workflowId = String(body.workflowId ?? "");

  if (!workflowId) {
    return NextResponse.json({ error: "Thiếu workflowId" }, { status: 400 });
  }

  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow) {
    return NextResponse.json({ error: "Không tìm thấy workflow" }, { status: 404 });
  }

  const run = await prisma.workflowRun.create({
    data: { workflowId, taskId, status: "pending" },
    include: { workflow: { select: { name: true } } },
  });

  // Fire-and-forget: execution runs in the background, the response
  // doesn't wait for it. Errors are captured into the run's own log/status
  // by executeWorkflowRun itself; this catch is only a last-resort guard.
  executeWorkflowRun(run.id).catch((err) => {
    console.error(`[workflow-run ${run.id}] unhandled error`, err);
  });

  return NextResponse.json(run, { status: 201 });
}
