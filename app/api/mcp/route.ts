import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/tasks";

const TASK_STATUSES = ["backlog", "todo", "in_progress", "in_review", "done"] as const;
const TASK_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
const TASK_TYPES = ["task", "bug", "story", "epic"] as const;

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_projects",
      {
        title: "List projects",
        description:
          "List active (non-archived) projects/boards in the Self Management app, with their key, name, and Jira config.",
        inputSchema: z.object({}),
      },
      async () => {
        const projects = await prisma.project.findMany({
          where: { archived: false },
          orderBy: { createdAt: "asc" },
          select: { key: true, name: true, jiraSite: true, jiraProjectKey: true },
        });
        return {
          content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
        };
      }
    );

    server.registerTool(
      "create_task",
      {
        title: "Create task",
        description:
          "Create a task on a project's board in the Self Management app. Use list_projects first to find the projectKey.",
        inputSchema: z.object({
          projectKey: z.string().describe("Project board key, e.g. DEV"),
          title: z.string(),
          description: z.string().optional(),
          type: z.enum(TASK_TYPES).optional(),
          status: z.enum(TASK_STATUSES).optional(),
          priority: z.enum(TASK_PRIORITIES).optional(),
          estimate: z.number().optional(),
          dueDate: z.string().optional().describe("ISO date string, e.g. 2026-01-31"),
          jiraKey: z.string().optional(),
          jiraUrl: z.string().optional(),
        }),
      },
      async (input) => {
        const project = await prisma.project.findUnique({
          where: { key: input.projectKey.toUpperCase() },
        });
        if (!project) {
          return {
            content: [
              { type: "text", text: `No project found with key "${input.projectKey}".` },
            ],
            isError: true,
          };
        }

        const task = await createTask(project.id, {
          title: input.title,
          description: input.description,
          type: input.type,
          status: input.status,
          priority: input.priority,
          estimate: input.estimate ?? null,
          dueDate: input.dueDate ?? null,
          jiraKey: input.jiraKey ?? null,
          jiraUrl: input.jiraUrl ?? null,
        });

        return {
          content: [
            {
              type: "text",
              text: `Created ${project.key}-${task.number}: ${task.title}`,
            },
          ],
        };
      }
    );
  },
  { serverInfo: { name: "self-management", version: "1.0.0" } }
);

const authedHandler = withMcpAuth(
  handler,
  (_req, bearerToken) => {
    const expected = process.env.MCP_ACCESS_TOKEN;
    if (!expected || bearerToken !== expected) return undefined;
    return { token: bearerToken, clientId: "self-management-client", scopes: [] };
  },
  { required: true }
);

export { authedHandler as GET, authedHandler as POST };
