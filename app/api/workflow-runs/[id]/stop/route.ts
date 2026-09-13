import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stopWorkflowRun } from "@/lib/workflow-runner";

const STOPPABLE_STATUSES = new Set(["pending", "running"]);

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const run = await prisma.workflowRun.findUnique({ where: { id } });
  if (!run) {
    return NextResponse.json({ error: "Không tìm thấy run" }, { status: 404 });
  }
  if (!STOPPABLE_STATUSES.has(run.status)) {
    return NextResponse.json({ error: "Run này không còn đang chạy" }, { status: 400 });
  }

  // If the runner is executing in this process, aborting its controller
  // kills the in-flight child process and the runner itself marks the run
  // "cancelled" (and moves the task to "in_review"). Otherwise (e.g. dev
  // server restarted) there's no process to kill, so mark it cancelled
  // directly here, including the same task transition.
  const stoppedInProcess = stopWorkflowRun(id);
  let updated = run;
  if (!stoppedInProcess) {
    updated = await prisma.workflowRun.update({
      where: { id },
      data: { status: "cancelled", finishedAt: new Date() },
    });
    if (run.taskId) {
      await prisma.task.update({ where: { id: run.taskId }, data: { status: "in_review" } });
    }
  }

  return NextResponse.json(updated);
}
