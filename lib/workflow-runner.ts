import { spawn } from "node:child_process";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { emitWorkflowRunUpdate } from "@/lib/socket";
import type {
  AiStepConfig,
  ConditionStepConfig,
  ActionStepConfig,
} from "@/lib/workflow-constants";
import type { WorkflowStep, TaskType, TaskPriority, TaskStatus } from "@/app/generated/prisma/client";

const AI_STEP_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

type RunContext = {
  runId: string;
  log: string;
  workflowName: string;
};

class WorkflowCancelledError extends Error {
  constructor() {
    super("Workflow đã bị dừng theo yêu cầu.");
    this.name = "WorkflowCancelledError";
  }
}

// Tracks the AbortController for every run currently executing in this
// process, so a stop request can kill the in-flight child process. A run
// with no entry here is either not running in this process (e.g. server
// restarted) or already finished.
const activeRuns = new Map<string, AbortController>();

/**
 * Requests cancellation of a running workflow run. Returns true if an
 * active run was found and aborted, false if this process has no record
 * of it (the caller should then fall back to a direct DB status update).
 */
export function stopWorkflowRun(runId: string): boolean {
  const controller = activeRuns.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
}

async function appendLog(ctx: RunContext, line: string) {
  ctx.log += (ctx.log ? "\n" : "") + line;
  const updated = await prisma.workflowRun.update({ where: { id: ctx.runId }, data: { log: ctx.log } });
  emitWorkflowRunUpdate({ ...updated, workflow: { name: ctx.workflowName } });
}

function renderTemplate(
  template: string,
  vars: { title: string; description: string; key: string }
) {
  return template
    .replaceAll("{{task.title}}", vars.title)
    .replaceAll("{{task.description}}", vars.description)
    .replaceAll("{{task.key}}", vars.key);
}

/**
 * Runs a command and resolves as soon as the process itself exits — NOT
 * when its stdio pipes close. `execFile`/`exec` wait for pipe closure,
 * which hangs forever if the process spawns a detached grandchild that
 * inherits stdout/stderr and outlives it (e.g. `claude` launching the
 * user's globally-configured MCP servers as background helpers).
 */
function run(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new WorkflowCancelledError());
      return;
    }

    const child = spawn(cmd, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGKILL");
      settled = true;
      reject(new Error(`Lệnh timeout sau ${Math.round(timeoutMs / 1000)}s: ${cmd} ${args.join(" ")}`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 20 * 1024 * 1024) child.kill("SIGKILL");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.name === "AbortError") {
        reject(new WorkflowCancelledError());
        return;
      }
      reject(new Error(`Không chạy được lệnh: ${cmd} ${args.join(" ")}\n${err.message}`));
    });

    // "exit" fires as soon as the process itself terminates, regardless of
    // whether any grandchild it spawned is still holding the stdio pipes.
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            [`Lệnh thất bại (exit ${code}): ${cmd} ${args.join(" ")}`, stderr.trim(), stdout.trim()]
              .filter(Boolean)
              .join("\n")
          )
        );
      }
    });
  });
}

export async function executeWorkflowRun(runId: string): Promise<void> {
  const ctx: RunContext = { runId, log: "", workflowName: "" };

  async function fail(message: string): Promise<void> {
    await appendLog(ctx, `✕ ${message}`);
    const updated = await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "failed", finishedAt: new Date() },
    });
    emitWorkflowRunUpdate({ ...updated, workflow: { name: ctx.workflowName } });
    await markTaskInReview();
  }

  // A run's task moves to "in_progress" the moment its workflow starts, and
  // to "in_review" the moment the workflow reaches any terminal state
  // (success, failed, or cancelled) — regardless of outcome, there's now
  // something for a human to look at. Test runs from the Workflow Builder
  // have no taskId, so they never touch a task's status.
  async function markTaskInProgress(): Promise<void> {
    if (!task) return;
    await prisma.task.update({ where: { id: task.id }, data: { status: "in_progress" } });
  }

  async function markTaskInReview(): Promise<void> {
    if (!task) return;
    await prisma.task.update({ where: { id: task.id }, data: { status: "in_review" } });
  }

  const run_ = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: {
      workflow: { include: { steps: { orderBy: { order: "asc" } }, project: true } },
      task: true,
    },
  });
  if (!run_) return;

  const { workflow, task } = run_;
  const project = workflow.project;
  ctx.workflowName = workflow.name;

  const runningUpdate = await prisma.workflowRun.update({ where: { id: runId }, data: { status: "running" } });
  emitWorkflowRunUpdate({ ...runningUpdate, workflow: { name: workflow.name } });
  await markTaskInProgress();
  await appendLog(ctx, `Bắt đầu workflow "${workflow.name}"${task ? ` cho task ${project.key}-${task.number}` : ""}.`);

  if (!project.repoLocalPath || !existsSync(project.repoLocalPath)) {
    return fail(
      `Project chưa cấu hình repo local hợp lệ (repoLocalPath). Vào Project Settings để cấu hình.`
    );
  }
  if (!existsSync(path.join(project.repoLocalPath, ".git"))) {
    return fail(`"${project.repoLocalPath}" không phải 1 git repo (thiếu .git).`);
  }

  const templateVars = {
    title: task?.title ?? "",
    description: task?.description ?? "",
    key: task ? `${project.key}-${task.number}` : "",
  };

  const branchName = `ai/${project.key.toLowerCase()}-${task?.number ?? "run"}-${Date.now().toString(36)}`;
  const worktreePath = mkdtempSync(path.join(tmpdir(), "self-mgmt-wt-"));
  rmSync(worktreePath, { recursive: true, force: true }); // git worktree add needs the path to not exist

  const controller = new AbortController();
  activeRuns.set(runId, controller);
  const { signal } = controller;

  try {
    // Everything from here on can throw for all sorts of reasons (a git
    // command failing, claude exiting non-zero, gh not being installed...).
    // A single catch-all makes sure EVERY failure mode reaches fail() and
    // updates the run's status — nothing should be able to leave a run
    // stuck at "running" because one specific step's error handling didn't
    // anticipate it.
    try {
      await appendLog(ctx, `Tạo worktree tại ${worktreePath} trên branch ${branchName}...`);
      try {
        await run("git", ["fetch", "origin", project.defaultBranch], project.repoLocalPath, COMMAND_TIMEOUT_MS, signal);
        await run(
          "git",
          ["worktree", "add", worktreePath, "-b", branchName, `origin/${project.defaultBranch}`],
          project.repoLocalPath,
          COMMAND_TIMEOUT_MS,
          signal
        );
      } catch (err) {
        if (err instanceof WorkflowCancelledError) throw err;
        // fall back to local branch ref if there's no "origin" remote configured
        await run(
          "git",
          ["worktree", "add", worktreePath, "-b", branchName, project.defaultBranch],
          project.repoLocalPath,
          COMMAND_TIMEOUT_MS,
          signal
        );
      }

      let prUrl: string | null = null;

      for (const step of workflow.steps as WorkflowStep[]) {
        if (signal.aborted) throw new WorkflowCancelledError();
        if (!step.enabled) continue;

        if (step.type === "condition") {
          const config = JSON.parse(step.config) as ConditionStepConfig;
          await appendLog(ctx, `\n▶ Condition "${step.name}": ${config.command}`);
          try {
            const { stdout } = await run(
              "bash",
              ["-lc", config.command],
              worktreePath,
              COMMAND_TIMEOUT_MS,
              signal
            );
            await appendLog(ctx, stdout.trim() || "(không có output)");
          } catch (err) {
            if (err instanceof WorkflowCancelledError) throw err;
            const message = err instanceof Error ? err.message : String(err);
            await appendLog(ctx, message);
            if (!config.continueOnFailure) {
              return fail(`Condition "${step.name}" thất bại, dừng workflow.`);
            }
            await appendLog(ctx, `Condition thất bại nhưng cấu hình cho phép tiếp tục.`);
          }
          continue;
        }

        if (step.type === "ai_step") {
          const config = JSON.parse(step.config) as AiStepConfig;
          const prompt = renderTemplate(config.prompt, templateVars);
          await appendLog(ctx, `\n▶ AI step "${step.name}"`);
          const { stdout } = await run(
            "claude",
            ["-p", prompt, "--dangerously-skip-permissions"],
            worktreePath,
            AI_STEP_TIMEOUT_MS,
            signal
          );
          await appendLog(ctx, stdout.trim() || "(không có output)");
          continue;
        }

        if (step.type === "action") {
          const config = JSON.parse(step.config) as ActionStepConfig;
          if (config.actionType === "create_pr") {
            await appendLog(ctx, `\n▶ Action "${step.name}": create_pr`);

            const { stdout: statusOut } = await run(
              "git",
              ["status", "--porcelain"],
              worktreePath,
              COMMAND_TIMEOUT_MS,
              signal
            );
            if (!statusOut.trim()) {
              await appendLog(ctx, "Không có thay đổi nào để commit — bỏ qua tạo PR.");
              continue;
            }

            const title = config.prTitle
              ? renderTemplate(config.prTitle, templateVars)
              : templateVars.title || workflow.name;

            await run("git", ["add", "-A"], worktreePath, COMMAND_TIMEOUT_MS, signal);
            await run("git", ["commit", "-m", title], worktreePath, COMMAND_TIMEOUT_MS, signal);
            await run("git", ["push", "-u", "origin", branchName], worktreePath, COMMAND_TIMEOUT_MS, signal);

            const { stdout } = await run(
              "gh",
              [
                "pr",
                "create",
                "--base",
                project.defaultBranch,
                "--head",
                branchName,
                "--title",
                title,
                "--body",
                `Tự động tạo bởi workflow "${workflow.name}"${task ? ` cho task ${project.key}-${task.number}` : ""}.`,
              ],
              worktreePath,
              COMMAND_TIMEOUT_MS,
              signal
            );
            const urlMatch = stdout.match(/https:\/\/github\.com\/\S+/);
            prUrl = urlMatch ? urlMatch[0] : null;
            await appendLog(ctx, stdout.trim());
          }
          continue;
        }
      }

      await appendLog(ctx, `\n✓ Workflow hoàn tất.`);
      const successUpdate = await prisma.workflowRun.update({
        where: { id: runId },
        data: { status: "success", branchName, prUrl, finishedAt: new Date() },
      });
      emitWorkflowRunUpdate({ ...successUpdate, workflow: { name: ctx.workflowName } });
      await markTaskInReview();
    } catch (err) {
      if (err instanceof WorkflowCancelledError) {
        await appendLog(ctx, `\n✕ ${err.message}`);
        const cancelledUpdate = await prisma.workflowRun.update({
          where: { id: runId },
          data: { status: "cancelled", finishedAt: new Date() },
        });
        emitWorkflowRunUpdate({ ...cancelledUpdate, workflow: { name: ctx.workflowName } });
        await markTaskInReview();
      } else {
        const message = err instanceof Error ? err.message : String(err);
        await fail(message);
      }
    }
  } finally {
    activeRuns.delete(runId);
    try {
      await run(
        "git",
        ["worktree", "remove", worktreePath, "--force"],
        project.repoLocalPath,
        COMMAND_TIMEOUT_MS
      );
    } catch {
      rmSync(worktreePath, { recursive: true, force: true });
    }
  }
}
