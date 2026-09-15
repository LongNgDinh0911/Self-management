import { NextRequest, NextResponse } from "next/server";
import { rmSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { stopWorkflowRun } from "@/lib/workflow-runner";
import { emitWorkflowRunUpdate } from "@/lib/socket";

const STOPPABLE_STATUSES = new Set(["pending", "running", "paused"]);

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const run = await prisma.workflowRun.findUnique({
    where: { id },
    include: { workflow: { select: { name: true } } },
  });
  if (!run) {
    return NextResponse.json({ error: "Không tìm thấy run" }, { status: 404 });
  }
  if (!STOPPABLE_STATUSES.has(run.status)) {
    return NextResponse.json({ error: "Run này không còn đang chạy" }, { status: 400 });
  }

  // If the runner is executing in this process, aborting its controller
  // kills the in-flight child process and the runner itself marks the run
  // "cancelled" (emits the update and moves the task to "in_review").
  // Otherwise (e.g. dev server restarted) there's no process to kill, so
  // do the same here directly.
  const stoppedInProcess = stopWorkflowRun(id);
  let updated = run;
  if (!stoppedInProcess) {
    updated = await prisma.workflowRun.update({
      where: { id },
      data: { status: "cancelled", finishedAt: new Date() },
      include: { workflow: { select: { name: true } } },
    });
    emitWorkflowRunUpdate(updated);
    if (run.taskId) {
      await prisma.task.update({ where: { id: run.taskId }, data: { status: "in_review" } });
    }
    // A paused run's worktree was deliberately kept alive on disk for
    // review — nothing else ever cleans it up if the run ends here instead
    // of being continued, so do it now.
    if (run.worktreePath) {
      rmSync(run.worktreePath, { recursive: true, force: true });
    }
  }

  return NextResponse.json(updated);
}
