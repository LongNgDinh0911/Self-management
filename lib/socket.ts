import type { Server as SocketIOServer, Socket } from "socket.io";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import type { Task, WorkflowRun } from "@/app/generated/prisma/client";

type RunWithWorkflow = WorkflowRun & { workflow: { name: string } };
type TaskWithRelations = Task & { workflowRuns: RunWithWorkflow[] };

export const taskWithRelationsInclude = {
  workflowRuns: {
    orderBy: { startedAt: "desc" as const },
    take: 1,
    include: { workflow: { select: { name: true } } },
  },
};

// A plain module-level variable here would NOT actually be shared between
// server.ts (which calls setIO, run directly by tsx) and code reached
// through Next's own dev-mode bundler (API routes, and anything they call
// into like the workflow runner) — same reason lib/prisma.ts stashes its
// client on globalThis instead of a bare module variable. Without this,
// emitWorkflowRunUpdate silently sees io as null and every broadcast is a
// no-op, even though the socket itself joined its room just fine.
const globalForSocket = globalThis as unknown as { io: SocketIOServer | undefined };

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function runRoom(runId: string) {
  return `workflow-run:${runId}`;
}

function boardRoom(projectId: string) {
  return `board:${projectId}`;
}

export function setIO(server: SocketIOServer) {
  globalForSocket.io = server;

  server.use(async (socket, next) => {
    const token = parseCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
    const unlocked = await verifySessionToken(token);
    if (!unlocked) {
      next(new Error("unauthorized"));
      return;
    }
    next();
  });

  server.on("connection", (socket: Socket) => {
    socket.on("subscribe:workflow-run", async (runIds: string[], ack?: (runs: RunWithWorkflow[]) => void) => {
      if (!Array.isArray(runIds) || runIds.length === 0) {
        ack?.([]);
        return;
      }
      for (const id of runIds) {
        if (typeof id === "string") socket.join(runRoom(id));
      }
      const runs = await prisma.workflowRun.findMany({
        where: { id: { in: runIds.filter((id) => typeof id === "string") } },
        include: { workflow: { select: { name: true } } },
      });
      ack?.(runs);
    });

    socket.on("unsubscribe:workflow-run", (runIds: string[]) => {
      if (!Array.isArray(runIds)) return;
      for (const id of runIds) {
        if (typeof id === "string") socket.leave(runRoom(id));
      }
    });

    socket.on(
      "subscribe:board",
      async (projectId: string, ack?: (tasks: TaskWithRelations[]) => void) => {
        if (typeof projectId !== "string" || !projectId) {
          ack?.([]);
          return;
        }
        socket.join(boardRoom(projectId));
        const tasks = await prisma.task.findMany({
          where: { projectId },
          orderBy: { order: "asc" },
          include: taskWithRelationsInclude,
        });
        ack?.(tasks);
      }
    );

    socket.on("unsubscribe:board", (projectId: string) => {
      if (typeof projectId !== "string") return;
      socket.leave(boardRoom(projectId));
    });
  });
}

export function getIO() {
  return globalForSocket.io ?? null;
}

export function emitWorkflowRunUpdate(run: RunWithWorkflow) {
  globalForSocket.io?.to(runRoom(run.id)).emit("workflow-run:update", run);
}

export function emitTaskUpdate(task: TaskWithRelations) {
  globalForSocket.io?.to(boardRoom(task.projectId)).emit("task:updated", task);
}
