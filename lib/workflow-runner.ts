import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type {
  AiStepConfig,
  ConditionStepConfig,
  ActionStepConfig,
} from "@/lib/workflow-constants";
import type { WorkflowStep, TaskType, TaskPriority, TaskStatus } from "@/app/generated/prisma/client";

const execFileAsync = promisify(execFile);

const AI_STEP_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

type RunContext = {
  runId: string;
  log: string;
};

async function appendLog(ctx: RunContext, line: string) {
  ctx.log += (ctx.log ? "\n" : "") + line;
  await prisma.workflowRun.update({ where: { id: ctx.runId }, data: { log: ctx.log } });
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

async function run(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
      env: process.env,
    });
    return { stdout, stderr };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    throw new Error(
      [`Lệnh thất bại: ${cmd} ${args.join(" ")}`, e.stderr || e.message, e.stdout]
        .filter(Boolean)
        .join("\n")
    );
  }
}

export async function executeWorkflowRun(runId: string): Promise<void> {
  const ctx: RunContext = { runId, log: "" };

  async function fail(message: string): Promise<void> {
    await appendLog(ctx, `✕ ${message}`);
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "failed", finishedAt: new Date() },
    });
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

  await prisma.workflowRun.update({ where: { id: runId }, data: { status: "running" } });
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

  try {
    await appendLog(ctx, `Tạo worktree tại ${worktreePath} trên branch ${branchName}...`);
    try {
      await run("git", ["fetch", "origin", project.defaultBranch], project.repoLocalPath, COMMAND_TIMEOUT_MS);
      await run(
        "git",
        ["worktree", "add", worktreePath, "-b", branchName, `origin/${project.defaultBranch}`],
        project.repoLocalPath,
        COMMAND_TIMEOUT_MS
      );
    } catch {
      // fall back to local branch ref if there's no "origin" remote configured
      await run(
        "git",
        ["worktree", "add", worktreePath, "-b", branchName, project.defaultBranch],
        project.repoLocalPath,
        COMMAND_TIMEOUT_MS
      );
    }

    let prUrl: string | null = null;

    for (const step of workflow.steps as WorkflowStep[]) {
      if (!step.enabled) continue;

      if (step.type === "condition") {
        const config = JSON.parse(step.config) as ConditionStepConfig;
        await appendLog(ctx, `\n▶ Condition "${step.name}": ${config.command}`);
        try {
          const { stdout } = await run(
            "bash",
            ["-lc", config.command],
            worktreePath,
            COMMAND_TIMEOUT_MS
          );
          await appendLog(ctx, stdout.trim() || "(không có output)");
        } catch (err) {
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
        try {
          const { stdout } = await run(
            "claude",
            ["-p", prompt, "--dangerously-skip-permissions"],
            worktreePath,
            AI_STEP_TIMEOUT_MS
          );
          await appendLog(ctx, stdout.trim() || "(không có output)");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await appendLog(ctx, message);
          return fail(`AI step "${step.name}" thất bại, dừng workflow.`);
        }
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
            COMMAND_TIMEOUT_MS
          );
          if (!statusOut.trim()) {
            await appendLog(ctx, "Không có thay đổi nào để commit — bỏ qua tạo PR.");
            continue;
          }

          const title = config.prTitle
            ? renderTemplate(config.prTitle, templateVars)
            : templateVars.title || workflow.name;

          await run("git", ["add", "-A"], worktreePath, COMMAND_TIMEOUT_MS);
          await run("git", ["commit", "-m", title], worktreePath, COMMAND_TIMEOUT_MS);
          await run("git", ["push", "-u", "origin", branchName], worktreePath, COMMAND_TIMEOUT_MS);

          try {
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
              COMMAND_TIMEOUT_MS
            );
            const urlMatch = stdout.match(/https:\/\/github\.com\/\S+/);
            prUrl = urlMatch ? urlMatch[0] : null;
            await appendLog(ctx, stdout.trim());
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await appendLog(ctx, message);
            return fail(`Tạo PR thất bại, dừng workflow.`);
          }
        }
        continue;
      }
    }

    await appendLog(ctx, `\n✓ Workflow hoàn tất.`);
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "success", branchName, prUrl, finishedAt: new Date() },
    });
  } finally {
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
