import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeWorkflowRun } from "@/lib/workflow-runner";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const run = await prisma.workflowRun.findUnique({ where: { id } });
  if (!run) {
    return NextResponse.json({ error: "Không tìm thấy run" }, { status: 404 });
  }
  if (run.status !== "paused") {
    return NextResponse.json({ error: "Run này không ở trạng thái paused" }, { status: 400 });
  }

  // executeWorkflowRun reattaches to the same worktree (picking up whatever
  // was edited while paused), commits it, and keeps walking the step tree
  // from there — continuing is just re-invoking it.
  executeWorkflowRun(run.id).catch((err) => {
    console.error(`[workflow-run ${run.id}] unhandled error on continue`, err);
  });

  return NextResponse.json({ ok: true });
}
