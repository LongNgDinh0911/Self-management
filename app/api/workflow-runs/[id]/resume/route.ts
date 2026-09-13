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
  if (run.status !== "crashed") {
    return NextResponse.json({ error: "Chỉ resume được run đã bị crash" }, { status: 400 });
  }

  // executeWorkflowRun reads currentStepId/branchName off the run itself
  // and continues from there — resuming is just re-invoking it.
  executeWorkflowRun(run.id).catch((err) => {
    console.error(`[workflow-run ${run.id}] unhandled error on resume`, err);
  });

  return NextResponse.json({ ok: true });
}
