import type { TaskPriority, TaskStatus, TaskType } from "@/app/generated/prisma/client";

const JIRA_KEY_PATTERN = /([A-Z][A-Z0-9]+-\d+)/i;

export function parseJiraRef(
  input: string,
  jiraSite?: string | null
): { jiraKey: string | null; jiraUrl: string | null } {
  const trimmed = input.trim();
  if (!trimmed) return { jiraKey: null, jiraUrl: null };

  const match = trimmed.match(JIRA_KEY_PATTERN);
  const isUrl = /^https?:\/\//i.test(trimmed);

  if (isUrl) {
    return {
      jiraUrl: trimmed,
      jiraKey: match ? match[1].toUpperCase() : null,
    };
  }

  const key = match ? match[1].toUpperCase() : trimmed.toUpperCase();
  return {
    jiraKey: key,
    jiraUrl: jiraSite ? `https://${jiraSite}/browse/${key}` : null,
  };
}

export function mapJiraPriority(name?: string | null): TaskPriority {
  switch ((name ?? "").toLowerCase()) {
    case "highest":
      return "urgent";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
    case "lowest":
      return "low";
    default:
      return "none";
  }
}

export function mapJiraType(name?: string | null): TaskType {
  const n = (name ?? "").toLowerCase();
  if (n.includes("bug")) return "bug";
  if (n.includes("story")) return "story";
  if (n.includes("epic")) return "epic";
  return "task";
}

export function mapJiraStatus(categoryKey?: string | null, statusName?: string | null): TaskStatus {
  if ((statusName ?? "").toLowerCase().includes("review")) return "in_review";
  switch (categoryKey) {
    case "new":
      return "backlog";
    case "indeterminate":
      return "in_progress";
    case "done":
      return "done";
    default:
      return "backlog";
  }
}

type AdfNode = {
  type?: string;
  text?: string;
  content?: AdfNode[];
};

const ADF_BLOCK_TYPES = new Set(["paragraph", "heading", "listItem", "codeBlock", "blockquote"]);

function adfNodeToText(node: AdfNode | null | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  const childText = Array.isArray(node.content) ? node.content.map(adfNodeToText).join("") : "";
  return node.type && ADF_BLOCK_TYPES.has(node.type) ? `${childText}\n\n` : childText;
}

export function adfToPlainText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return typeof doc === "string" ? doc : "";
  return adfNodeToText(doc as AdfNode)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
