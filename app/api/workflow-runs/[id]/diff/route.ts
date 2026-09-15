import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { prisma } from "@/lib/prisma";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 5 * 1024 * 1024; // 5MB — a diff viewer, not a full patch pipeline

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const run = await prisma.workflowRun.findUnique({
    where: { id },
    include: { workflow: { include: { project: true } } },
  });
  if (!run) {
    return NextResponse.json({ error: "Không tìm thấy run" }, { status: 404 });
  }
  if (!run.worktreePath || !existsSync(run.worktreePath)) {
    return NextResponse.json({ error: "Không có worktree để xem diff (run chưa chạy hoặc đã dọn dẹp)" }, { status: 404 });
  }

  const { defaultBranch } = run.workflow.project;
  const opts = { cwd: run.worktreePath, maxBuffer: MAX_BUFFER };

  // Diff against the base branch so this shows the full accumulated change
  // so far (every committed step plus whatever's being edited right now),
  // matching what the eventual PR would contain — not just today's
  // uncommitted edits in isolation.
  let baseRef = `origin/${defaultBranch}`;
  try {
    await execFileAsync("git", ["rev-parse", "--verify", baseRef], opts);
  } catch {
    baseRef = defaultBranch;
  }

  try {
    // Plain `git diff <ref>` only shows changes to paths git already knows
    // about — a brand new file a human just created while reviewing stays
    // invisible until it's at least "intent to add". This marks paths
    // without staging their content, so the diff below still shows the
    // real content as an addition (and doesn't change what the next
    // checkpoint's `git add -A` + commit would do).
    await execFileAsync("git", ["add", "-A", "-N", "."], opts);
    const { stdout } = await execFileAsync("git", ["diff", baseRef], opts);
    return NextResponse.json({ diff: stdout, baseRef, worktreePath: run.worktreePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Không lấy được diff: ${message}` }, { status: 500 });
  }
}
