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
