import { spawn } from "node:child_process";
import { mkdtempSync, existsSync, rmSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
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

const AI_STEP_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
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

// Thrown to unwind out of the recursive step walk when a step configured
// with pauseAfter finishes — not an error, just a clean "stop here for now"
// signal caught at the top level, distinct from cancellation/failure.
class WorkflowPausedError extends Error {
  constructor() {
    super("Workflow đang dừng để review.");
    this.name = "WorkflowPausedError";
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

// Buffers text pushed by runClaude()'s NDJSON parser and flushes it into
// the run log at most once a second — parsed events can arrive several
// times a second (every tool call, every text block), and writing each one
// straight to the DB + socket would hammer both for no visible benefit.
function createLogStreamer(ctx: RunContext) {
  const FLUSH_INTERVAL_MS = 1000;
  let buffer = "";
  let timer: NodeJS.Timeout | null = null;

  async function flush() {
    if (!buffer) return;
    const text = buffer;
    buffer = "";
    // Raw append (unlike appendLog) — chunks don't align to line
    // boundaries, so forcing a newline between them would fragment
    // ordinary sentences and words.
    ctx.log += text;
    const updated = await prisma.workflowRun.update({ where: { id: ctx.runId }, data: { log: ctx.log } });
    emitWorkflowRunUpdate({ ...updated, workflow: { name: ctx.workflowName } });
  }

  return {
    push(chunk: string) {
      buffer += chunk;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        flush().catch(() => {});
      }, FLUSH_INTERVAL_MS);
    },
    async finish() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await flush();
    },
  };
}

// Short one-line summary of a tool call for the run log — full inputs
// (a whole file's new contents for Write/Edit, etc.) would bloat the log
// far past what's useful to skim while a step is in progress.
function summarizeToolUse(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "Bash":
      return `Bash: ${String(input.command ?? "").slice(0, 200)}`;
    case "Write":
      return `Write ${input.file_path ?? ""}`;
    case "Edit":
      return `Edit ${input.file_path ?? ""}`;
    case "Read":
      return `Read ${input.file_path ?? ""}`;
    case "Glob":
      return `Glob ${input.pattern ?? ""}`;
    case "Grep":
      return `Grep ${input.pattern ?? ""}`;
    default:
      return name;
  }
}

// Runs `claude -p` and streams progress into the run log as it works,
// instead of the caller waiting in silence for the whole invocation to
// finish. The default `--output-format text` turns out to buffer its ENTIRE
// response and print nothing until the process exits (verified empirically
// — plain stdout piping gives no incremental signal at all), so getting any
// live progress requires switching to `--output-format stream-json`, which
// emits one JSON object per line as things happen: tool calls, assistant
// prose, and a final "result" event carrying the complete answer text.
// Returns that final text — NOT the raw NDJSON stdout, which is wire
// format, not the actual output callers (e.g. Planning, which saves this
// as the task's plan) care about.
async function runClaude(
  prompt: string,
  cwd: string,
  timeoutMs: number,
  signal: AbortSignal,
  ctx: RunContext
): Promise<string> {
  const streamer = createLogStreamer(ctx);
  // Separates the streamed content from the "▶ ..." banner line the
  // caller just logged (that appendLog call has no trailing newline of its
  // own), so text/tool-use output never runs straight into it.
  streamer.push("\n");
  let lineBuffer = "";
  let finalText = "";

  function handleLine(line: string) {
    if (!line.trim()) return;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line);
    } catch {
      return; // stray non-JSON noise on stdout — ignore rather than crash the run
    }
    if (event.type === "assistant") {
      const message = event.message as { content?: Record<string, unknown>[] } | undefined;
      for (const block of message?.content ?? []) {
        if (block.type === "text" && typeof block.text === "string" && block.text) {
          streamer.push(block.text);
        } else if (block.type === "tool_use") {
          const summary = summarizeToolUse(
            String(block.name),
            (block.input as Record<string, unknown>) ?? {}
          );
          streamer.push(`\n→ ${summary}\n`);
        }
      }
    } else if (event.type === "result" && typeof event.result === "string") {
      finalText = event.result;
    }
  }

  function handleChunk(chunk: string) {
    lineBuffer += chunk;
    const lines = lineBuffer.split("\n");
    lineBuffer = lines.pop() ?? "";
    for (const line of lines) handleLine(line);
  }

  try {
    await run(
      "claude",
      ["-p", prompt, "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions"],
      cwd,
      timeoutMs,
      signal,
      handleChunk
    );
  } catch (err) {
    if (lineBuffer.trim()) handleLine(lineBuffer);
    await streamer.finish();
    if (err instanceof WorkflowCancelledError) throw err;
    // Drop the raw NDJSON dump `run()` would otherwise fold into the error
    // (stdout is wire format, not something a human should have to read) —
    // keep just the failure header plus whatever text we did manage to
    // parse before things went wrong.
    const header = err instanceof Error ? err.message.split("\n")[0] : String(err);
    throw new Error(finalText ? `${header}\n${finalText}` : header);
  }

  if (lineBuffer.trim()) handleLine(lineBuffer);
  await streamer.finish();
  return finalText;
}

function renderTemplate(
  template: string,
  vars: { title: string; description: string; key: string; planning: string }
) {
  return template
    .replaceAll("{{task.title}}", vars.title)
    .replaceAll("{{task.description}}", vars.description)
    .replaceAll("{{task.key}}", vars.key)
    .replaceAll("{{task.planning}}", vars.planning);
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
  signal?: AbortSignal,
  onChunk?: (chunk: string) => void
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
      onChunk?.(chunk.toString());
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
    // Guarded: if a stop request already marked this run "cancelled" while
    // we were mid-execution (e.g. the in-process AbortController couldn't be
    // found), this must not resurrect it back to a non-cancelled status.
    const { count } = await prisma.workflowRun.updateMany({
      where: { id: runId, status: "running" },
      data: { status: "failed", finishedAt: new Date() },
    });
    if (count > 0) {
      const updated = await prisma.workflowRun.findUniqueOrThrow({ where: { id: runId } });
      emitWorkflowRunUpdate({ ...updated, workflow: { name: ctx.workflowName } });
      await markTaskInReview();
    }
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
      workflow: {
        include: {
          steps: { orderBy: { order: "asc" } },
          project: { include: { projectSkills: { include: { skill: true } } } },
        },
      },
      task: true,
      parentRun: true,
    },
  });
  if (!run_) return;

  const { workflow, task } = run_;
  const project = workflow.project;
  const skillsById = new Map(project.projectSkills.map((ps) => [ps.skill.id, ps.skill]));
  ctx.workflowName = workflow.name;
  const wasPaused = run_.status === "paused";

  // Atomically claim the run: only proceed if it's still "pending" (fresh
  // trigger), "crashed" (a dev-server restart orphaned it mid-execution —
  // see the boot-time reconciliation in server.ts), or "paused" (a human
  // asked for this — see /continue). If a stop request already flipped it
  // to "cancelled" in the gap between run creation and this point, count is
  // 0 and we bail out without ever having registered anything to clean up.
  const claimed = await prisma.workflowRun.updateMany({
    where: { id: runId, status: { in: ["pending", "crashed", "paused"] } },
    data: { status: "running" },
  });
  if (claimed.count === 0) return;
  const runningUpdate = await prisma.workflowRun.findUniqueOrThrow({ where: { id: runId } });
  emitWorkflowRunUpdate({ ...runningUpdate, workflow: { name: workflow.name } });
  await markTaskInProgress();

  if (!project.repoLocalPath || !existsSync(project.repoLocalPath)) {
    return fail(
      `Project chưa cấu hình repo local hợp lệ (repoLocalPath). Vào Project Settings để cấu hình.`
    );
  }
  if (!existsSync(path.join(project.repoLocalPath, ".git"))) {
    return fail(`"${project.repoLocalPath}" không phải 1 git repo (thiếu .git).`);
  }

  // `planning` starts from whatever the task already had (e.g. from a
  // previous run's Planning node) and is updated in place the moment a
  // Planning step runs in THIS run, so any step after it in the same
  // workflow can reference the fresh plan via {{task.planning}}.
  const templateVars = {
    title: task?.title ?? "",
    description: task?.description ?? "",
    key: task ? `${project.key}-${task.number}` : "",
    planning: task?.planning ?? "",
  };

  // Reusing an existing branch means either resuming this same run after a
  // crash (it already has its own branchName from a prior partial
  // execution) or chaining onto a parent run's result (continue on the
  // branch/PR that run produced, instead of starting fresh from main).
  const isResuming = !!run_.branchName;
  const isChaining = !run_.branchName && !!run_.parentRun?.branchName;
  const isNewBranch = !isResuming && !isChaining;
  const branchName =
    run_.branchName ??
    run_.parentRun?.branchName ??
    `ai/${project.key.toLowerCase()}-${task?.number ?? "run"}-${Date.now().toString(36)}`;
  if (!run_.branchName) {
    await prisma.workflowRun.update({ where: { id: runId }, data: { branchName } });
  }

  // The step list is a tree (any step may have several children — e.g.
  // multiple Condition steps gating different sub-paths off the same
  // parent), not a flat sequence. Group by parentStepId once up front so
  // walking it is just "children of X, in sibling order".
  const allSteps = workflow.steps as WorkflowStep[];
  const childrenByParent = new Map<string | null, WorkflowStep[]>();
  for (const step of allSteps) {
    const key = step.parentStepId;
    const siblings = childrenByParent.get(key) ?? [];
    siblings.push(step);
    childrenByParent.set(key, siblings);
  }

  // stepStatuses: "completed" (ran normally, or a condition whose gate
  // stayed open — either way its children still run) vs "pruned" (a
  // condition's gate closed, so its whole subtree is skipped) vs "planned"
  // (a Planning step generated its plan and paused — Continue runs it
  // through its second phase: executing that plan). On resume, a step
  // already marked here has its own action skipped, but "completed" ones
  // still recurse into children in case not all of them finished.
  const stepStatuses: Record<string, "completed" | "pruned" | "planned"> = JSON.parse(
    run_.stepStatuses || "{}"
  );
  const alreadyDoneCount = Object.keys(stepStatuses).length;

  await appendLog(
    ctx,
    `${isResuming ? "Tiếp tục" : "Bắt đầu"} workflow "${workflow.name}"${task ? ` cho task ${project.key}-${task.number}` : ""} trên branch ${branchName}${
      wasPaused
        ? " (tiếp tục sau khi pause review)"
        : isResuming
          ? " (resume sau crash)"
          : isChaining
            ? " (nối tiếp từ workflow trước)"
            : ""
    }.`
  );
  if (alreadyDoneCount > 0) {
    await appendLog(ctx, `Bỏ qua ${alreadyDoneCount} step đã hoàn tất trước đó.`);
  }

  // Reattach to the SAME worktree directory a paused run left behind, if it
  // still exists — a fresh one would only have whatever was already
  // committed, silently discarding any edits made by hand while paused.
  // Crash-resume can safely fall back to a fresh worktree instead (nothing
  // uncommitted to lose there, unlike a deliberate pause-for-review).
  const reusingWorktree =
    !!run_.worktreePath &&
    existsSync(run_.worktreePath) &&
    existsSync(path.join(run_.worktreePath, ".git"));
  const worktreePath = reusingWorktree
    ? run_.worktreePath!
    : mkdtempSync(path.join(tmpdir(), "self-mgmt-wt-"));
  if (!reusingWorktree) {
    rmSync(worktreePath, { recursive: true, force: true }); // git worktree add needs the path to not exist
    await prisma.workflowRun.update({ where: { id: runId }, data: { worktreePath } });
  }

  const controller = new AbortController();
  activeRuns.set(runId, controller);
  const { signal } = controller;
  let didPause = false;

  // Commits (and pushes) any pending changes in the worktree as a checkpoint
  // after a step finishes, and records its status. A crash after this point
  // resumes without redoing this step (or, for a pruned branch, without
  // ever revisiting its subtree), and the work already done is safe on the
  // branch even if the temp worktree directory itself is later lost.
  async function checkpoint(
    step: WorkflowStep,
    status: "completed" | "pruned" | "planned" = "completed"
  ) {
    const { stdout: statusOut } = await run(
      "git",
      ["status", "--porcelain"],
      worktreePath,
      COMMAND_TIMEOUT_MS,
      signal
    );
    if (statusOut.trim()) {
      await run("git", ["add", "-A"], worktreePath, COMMAND_TIMEOUT_MS, signal);
      await run(
        "git",
        ["commit", "-m", `${workflow.name}: ${step.name}`],
        worktreePath,
        COMMAND_TIMEOUT_MS,
        signal
      );
      await run("git", ["push", "-u", "origin", branchName], worktreePath, COMMAND_TIMEOUT_MS, signal);
    }
    stepStatuses[step.id] = status;
    await prisma.workflowRun.update({ where: { id: runId }, data: { stepStatuses: JSON.stringify(stepStatuses) } });
  }

  try {
    // Everything from here on can throw for all sorts of reasons (a git
    // command failing, claude exiting non-zero, gh not being installed...).
    // A single catch-all makes sure EVERY failure mode reaches fail() and
    // updates the run's status — nothing should be able to leave a run
    // stuck at "running" because one specific step's error handling didn't
    // anticipate it.
    try {
      if (reusingWorktree) {
        await appendLog(ctx, `Dùng lại worktree đã có tại ${worktreePath} (từ lần pause trước).`);
      } else {
        // Stale administrative entries for worktrees whose directory no
        // longer exists (e.g. left behind by a crashed process) block `git
        // worktree add` from reusing that branch until pruned.
        await run("git", ["worktree", "prune"], project.repoLocalPath, COMMAND_TIMEOUT_MS, signal);

        // A crashed process's worktree directory itself usually still exists
        // (only the graceful `finally` cleanup removes it), so `prune` alone
        // won't free up the branch — git refuses to check out a branch that's
        // already checked out elsewhere. Force-detach any worktree still
        // attached to this run's branch before reusing (or creating) it.
        if (!isNewBranch) {
          const { stdout: listOut } = await run(
            "git",
            ["worktree", "list", "--porcelain"],
            project.repoLocalPath,
            COMMAND_TIMEOUT_MS,
            signal
          );
          for (const entry of listOut.split("\n\n")) {
            const pathMatch = entry.match(/^worktree (.+)$/m);
            const branchMatch = entry.match(/^branch refs\/heads\/(.+)$/m);
            if (pathMatch && branchMatch?.[1] === branchName) {
              await run(
                "git",
                ["worktree", "remove", pathMatch[1], "--force"],
                project.repoLocalPath,
                COMMAND_TIMEOUT_MS,
                signal
              ).catch(() => {});
            }
          }
        }

        try {
          await run("git", ["fetch", "origin", project.defaultBranch], project.repoLocalPath, COMMAND_TIMEOUT_MS, signal);
        } catch (err) {
          if (err instanceof WorkflowCancelledError) throw err;
          // best-effort refresh; the fallbacks below cover no-"origin" repos
        }

        if (isNewBranch) {
          try {
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
        } else {
          // Resuming or chaining: the branch already exists as a local ref in
          // the shared repo (worktree removal never deletes the branch
          // itself), already carrying every commit made in any worktree tied
          // to it — just attach a fresh worktree to it.
          try {
            await run(
              "git",
              ["worktree", "add", worktreePath, branchName],
              project.repoLocalPath,
              COMMAND_TIMEOUT_MS,
              signal
            );
          } catch (err) {
            if (err instanceof WorkflowCancelledError) throw err;
            // The branch was persisted to the run but a crash struck before
            // `git worktree add -b` itself ever completed, so it doesn't
            // actually exist yet — create it now, same as a brand-new run.
            try {
              await run(
                "git",
                ["worktree", "add", worktreePath, "-b", branchName, `origin/${project.defaultBranch}`],
                project.repoLocalPath,
                COMMAND_TIMEOUT_MS,
                signal
              );
            } catch (err2) {
              if (err2 instanceof WorkflowCancelledError) throw err2;
              await run(
                "git",
                ["worktree", "add", worktreePath, "-b", branchName, project.defaultBranch],
                project.repoLocalPath,
                COMMAND_TIMEOUT_MS,
                signal
              );
            }
          }
        }
      }

      // Materialize this project's instruction + enabled skills into the
      // worktree using Claude Code's own native conventions, so every AI
      // step run here picks them up automatically — same as if a developer
      // had them checked out locally. These are scaffold files specific to
      // this run, not part of the project's real source, so they're kept
      // out of `git add -A` via .git/info/exclude (added to checkpoint()'s
      // sole gitignore-equivalent knob) rather than ever being committed.
      {
        const claudeDir = path.join(worktreePath, ".claude");
        mkdirSync(claudeDir, { recursive: true });
        const excludeEntries: string[] = [];

        if (project.instruction && project.instruction.trim()) {
          writeFileSync(path.join(claudeDir, "CLAUDE.local.md"), project.instruction);
          excludeEntries.push(".claude/CLAUDE.local.md");
        }

        for (const ps of project.projectSkills) {
          const skill = ps.skill;
          const skillDir = path.join(claudeDir, "skills", skill.name);
          mkdirSync(skillDir, { recursive: true });
          writeFileSync(
            path.join(skillDir, "SKILL.md"),
            skill.content || `# ${skill.name}\n\n${skill.description}\n`
          );
          excludeEntries.push(`.claude/skills/${skill.name}/`);
        }

        if (excludeEntries.length > 0) {
          const { stdout: excludePathOut } = await run(
            "git",
            ["rev-parse", "--git-path", "info/exclude"],
            worktreePath,
            COMMAND_TIMEOUT_MS,
            signal
          );
          const excludePath = path.isAbsolute(excludePathOut.trim())
            ? excludePathOut.trim()
            : path.join(worktreePath, excludePathOut.trim());
          mkdirSync(path.dirname(excludePath), { recursive: true });
          const existingExclude = existsSync(excludePath) ? readFileSync(excludePath, "utf8") : "";
          const newEntries = excludeEntries.filter((entry) => !existingExclude.includes(entry));
          if (newEntries.length > 0) {
            appendFileSync(
              excludePath,
              (existingExclude && !existingExclude.endsWith("\n") ? "\n" : "") +
                newEntries.join("\n") +
                "\n"
            );
          }
        }
      }

      let prUrl: string | null = run_.prUrl ?? null;

      // Walks the step tree depth-first: run this step (unless a prior pass
      // already did — resume just needs to keep descending to find what's
      // still incomplete), then its children in sibling order. A Condition
      // step whose gate closes marks itself "pruned" and returns before
      // reaching the recursion below, cutting only its own subtree —
      // sibling branches off the same parent are unaffected.
      async function runStep(step: WorkflowStep): Promise<void> {
        if (signal.aborted) throw new WorkflowCancelledError();
        if (!step.enabled) return; // disabling a step skips its whole subtree

        const existingStatus = stepStatuses[step.id];
        if (existingStatus === "pruned") return;
        if (existingStatus !== "completed") {
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
                await appendLog(ctx, `Condition "${step.name}" thất bại — bỏ qua nhánh này.`);
                await checkpoint(step, "pruned");
                return;
              }
              await appendLog(ctx, `Condition thất bại nhưng cấu hình cho phép tiếp tục.`);
            }
            await checkpoint(step);
          } else if (step.type === "ai_step") {
            const config = JSON.parse(step.config) as AiStepConfig;
            let prompt = renderTemplate(config.prompt, templateVars);
            const skill = config.skillId ? skillsById.get(config.skillId) : undefined;
            if (skill) {
              prompt = `Dùng skill "${skill.name}" (xem .claude/skills/${skill.name}/SKILL.md) khi thực hiện việc dưới đây.\n\n${prompt}`;
            }
            await appendLog(ctx, `\n▶ AI step "${step.name}"`);
            const text = await runClaude(prompt, worktreePath, AI_STEP_TIMEOUT_MS, signal, ctx);
            if (!text.trim()) await appendLog(ctx, "(không có output)");
            await checkpoint(step);
          } else if (step.type === "planning") {
            if (existingStatus === "planned") {
              // Phase 2 (reached via Continue after a pause): the human has
              // had a chance to review/edit the plan (and answer whatever
              // open questions it raised) via the Planning tab — execute
              // whatever task.planning holds NOW, not what it held when
              // phase 1 paused. Re-snapshot onto the run too, so its history
              // reflects the plan as actually executed, not the pre-edit draft.
              if (task) {
                await prisma.workflowRun.update({
                  where: { id: runId },
                  data: { planning: templateVars.planning || null },
                });
              }
              await appendLog(ctx, `\n▶ Planning "${step.name}": thực thi plan`);
              if (!templateVars.planning.trim()) {
                await appendLog(ctx, "Không có nội dung plan để thực thi — bỏ qua.");
              } else {
                const execPrompt = [
                  "Thực thi đầy đủ theo kế hoạch sau. Đây là chạy tự động, không có ai theo dõi để trả lời —",
                  "nếu plan có điểm còn mở/cần quyết định, tự chọn phương án hợp lý nhất rồi làm luôn,",
                  "không dừng lại hỏi. Viết code, đừng chỉ mô tả:",
                  "",
                  templateVars.planning,
                ].join("\n");
                const text = await runClaude(execPrompt, worktreePath, AI_STEP_TIMEOUT_MS, signal, ctx);
                if (!text.trim()) await appendLog(ctx, "(không có output)");
              }
              await checkpoint(step);
            } else {
              // Phase 1: generate a plan (or reuse the task's existing one).
              await appendLog(ctx, `\n▶ Planning "${step.name}"`);
              if (!task) {
                await appendLog(ctx, "Run này không gắn với task nào — bỏ qua, không có nơi để lưu planning.");
              } else if (templateVars.planning.trim()) {
                await appendLog(ctx, "Task đã có planning từ trước — bỏ qua, không tạo lại.");
              } else {
                const prompt = [
                  "Phân tích task sau và viết 1 bản kế hoạch triển khai (implementation plan) rõ ràng,",
                  "chi tiết, dạng markdown — dùng heading, danh sách các bước cần làm, và nêu rủi ro/lưu ý",
                  "nếu có.",
                  "",
                  `Task: ${templateVars.title}`,
                  "",
                  templateVars.description || "(không có mô tả)",
                  "",
                  "CHỈ trả lời bằng nội dung plan dạng markdown. Không sửa file, không chạy lệnh nào khác.",
                ].join("\n");

                const text = await runClaude(prompt, worktreePath, AI_STEP_TIMEOUT_MS, signal, ctx);
                const planning = text.trim();
                await prisma.task.update({ where: { id: task.id }, data: { planning } });
                templateVars.planning = planning;
                await appendLog(
                  ctx,
                  "✓ Đã lưu planning vào tab Planning của ticket. Các step sau có thể dùng {{task.planning}} trong prompt."
                );
              }

              if (task) {
                // Snapshot onto the run itself (distinct from Task.planning,
                // which later runs will move on) so the run history can
                // always show exactly what plan THIS run worked with.
                await prisma.workflowRun.update({
                  where: { id: runId },
                  data: { planning: templateVars.planning || null },
                });
              }

              if (step.pauseAfter && task && templateVars.planning.trim()) {
                await checkpoint(step, "planned");
                await appendLog(
                  ctx,
                  `\n⏸ Plan đã sẵn sàng để review tại tab Planning. Sửa/trả lời các câu hỏi còn mở nếu có, xong bấm "Continue" để thực thi plan.`
                );
                const pausedUpdate = await prisma.workflowRun.update({
                  where: { id: runId },
                  data: { status: "paused" },
                });
                emitWorkflowRunUpdate({ ...pausedUpdate, workflow: { name: ctx.workflowName } });
                didPause = true;
                throw new WorkflowPausedError();
              }
              await checkpoint(step);
            }
          } else if (step.type === "action") {
            const config = JSON.parse(step.config) as ActionStepConfig;
            if (config.actionType === "create_pr") {
              await appendLog(ctx, `\n▶ Action "${step.name}": create_pr`);
              // Commit anything left over first — normally every prior step
              // already checkpointed its own changes, this just covers the
              // edge case of a step that touched files without one.
              await checkpoint(step);

              const { stdout: aheadOut } = await run(
                "git",
                ["rev-list", "--count", `origin/${project.defaultBranch}..HEAD`],
                worktreePath,
                COMMAND_TIMEOUT_MS,
                signal
              );
              if (parseInt(aheadOut.trim(), 10) === 0) {
                await appendLog(ctx, "Không có commit nào mới so với base — bỏ qua tạo PR.");
              } else {
                // Chaining onto a parent run's branch: a PR may already be
                // open for it. Reuse it instead of letting `gh pr create` fail.
                let existingPrUrl: string | null = null;
                try {
                  const { stdout: viewOut } = await run(
                    "gh",
                    ["pr", "view", branchName, "--json", "url"],
                    worktreePath,
                    COMMAND_TIMEOUT_MS,
                    signal
                  );
                  existingPrUrl = (JSON.parse(viewOut) as { url: string }).url;
                } catch (err) {
                  if (err instanceof WorkflowCancelledError) throw err;
                  existingPrUrl = null;
                }

                if (existingPrUrl) {
                  prUrl = existingPrUrl;
                  await appendLog(ctx, `PR đã tồn tại cho branch này, dùng lại: ${existingPrUrl}`);
                } else {
                  const title = config.prTitle
                    ? renderTemplate(config.prTitle, templateVars)
                    : templateVars.title || workflow.name;

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
                await prisma.workflowRun.update({ where: { id: runId }, data: { prUrl } });
                if (task) {
                  await prisma.task.update({ where: { id: task.id }, data: { prUrl } });
                }
              }
            }
            await checkpoint(step);
          }

          // Only pause on the pass where this step just finished — a later
          // Continue call walks back through it to reach not-yet-done
          // children (existingStatus is "completed" by then) and must not
          // pause here again. Planning handles its own pauseAfter above
          // (only after phase 1, never after phase 2's execute) — it must
          // not also hit this generic check on the way out.
          if (step.pauseAfter && step.type !== "planning") {
            await appendLog(
              ctx,
              `\n⏸ Dừng lại để review sau step "${step.name}". Sửa code trực tiếp tại: ${worktreePath}\nBấm "Continue" trên run này khi xong.`
            );
            const pausedUpdate = await prisma.workflowRun.update({
              where: { id: runId },
              data: { status: "paused" },
            });
            emitWorkflowRunUpdate({ ...pausedUpdate, workflow: { name: ctx.workflowName } });
            didPause = true;
            throw new WorkflowPausedError();
          }
        }

        for (const child of childrenByParent.get(step.id) ?? []) {
          await runStep(child);
        }
      }

      for (const root of childrenByParent.get(null) ?? []) {
        await runStep(root);
      }

      await appendLog(ctx, `\n✓ Workflow hoàn tất.`);
      const { count: successCount } = await prisma.workflowRun.updateMany({
        where: { id: runId, status: "running" },
        data: { status: "success", branchName, prUrl, finishedAt: new Date() },
      });
      if (successCount > 0) {
        const successUpdate = await prisma.workflowRun.findUniqueOrThrow({ where: { id: runId } });
        emitWorkflowRunUpdate({ ...successUpdate, workflow: { name: ctx.workflowName } });
        await markTaskInReview();
      }
    } catch (err) {
      if (err instanceof WorkflowPausedError) {
        // Status/log were already set right before this was thrown — the
        // task's own status is deliberately left untouched (still
        // "in_progress"); the run itself being "paused" is what surfaces
        // the "needs your review" signal in the UI.
      } else if (err instanceof WorkflowCancelledError) {
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
    // A paused run keeps its worktree alive on disk so a human can edit it
    // before Continue reattaches to this exact same directory.
    if (!didPause) {
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
}
