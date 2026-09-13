---
name: clone-jira-ticket
description: Clone a Jira ticket into a task in this project's local Self Management app. Accepts a Jira issue key (e.g. "PROJ-123") or a Jira ticket URL. Triggers on "clone jira ticket", "import task from jira", "clone task from PROJ-123", or when the user pastes a Jira/Atlassian ticket link and asks to add it as a task.
---

# Clone a Jira ticket into a local task

This skill creates a task in the Self Management app (this repo) from a Jira
issue, using the Atlassian MCP tools already connected in this session
(`getJiraIssue`, `getAccessibleAtlassianResources`, etc). There is no
separate Jira REST integration inside the app itself — this skill IS the
"fetch from Jira" feature, run by you (Claude Code) on the user's behalf.

The app's Create Task form has its own "Jira ticket" field, but that one
only *stores* a pasted link/key as-is — it does not fetch anything (a
browser button can't call MCP tools). This skill is the actual fetch path.

## Two supported inputs

1. **Issue key** — e.g. `PROJ-123`. Use directly.
2. **Jira ticket URL** — e.g. `https://<site>.atlassian.net/browse/PROJ-123`
   or a Jira Cloud URL with `/jira/software/projects/PROJ/issues/PROJ-123`.
   Extract the issue key with a regex on the path: `([A-Z][A-Z0-9]+-\d+)`.

Both converge on the same fetch step below — the "via link" case just adds
one extra step (parse the key out of the URL first).

## Steps

1. **Authenticate to the local app and find the target project.** The app is
   PIN-protected (`proxy.ts`). Read `APP_PIN` from this repo's `.env`, then:

   ```bash
   curl -s -c /tmp/self-mgmt-cookies.txt -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d "{\"pin\":\"<APP_PIN from .env>\"}"
   curl -s -b /tmp/self-mgmt-cookies.txt http://localhost:3000/api/projects
   ```

   If the curl fails to connect, the dev server likely isn't running — tell
   the user rather than starting it yourself unprompted, unless they've
   already asked you to run the app this session.

   Match the target project: if the user named a board/key (e.g. "DEV"), use
   that. Otherwise ask — don't guess. Note its local `id` (needed for step 6)
   and its `jiraSite` / `jiraProjectKey` fields (set in that project's
   Settings page) — these save you from asking the user each time.

2. **Resolve the issue key** from the user's input (see "Two supported
   inputs" above). If the user gave a bare number (e.g. "123") and the
   project has a `jiraProjectKey`, combine them (`PROJ-123`). If you can't
   confidently resolve a key, ask instead of guessing.

3. **Resolve the Atlassian site** (cloudId). If the project's `jiraSite` is
   set, call `getAccessibleAtlassianResources` and match it directly — no
   need to ask. Otherwise ask the user which site, and suggest they save it
   in that project's Settings page for next time.

4. **Fetch the issue** with `getJiraIssue` (cloudId + issue key). Read:
   - `summary` → task title
   - `description` → may come back as Atlassian Document Format (ADF) JSON.
     Convert to plain text: walk the doc tree, concatenate `text` values
     from `text` nodes, insert a blank line between top-level block nodes
     (paragraphs, lists, headings). Don't try to preserve rich formatting —
     plain text is fine, this app's description field is a plain textarea.
   - `priority.name`, `issuetype.name`, `status.name` / `status.statusCategory.key`
   - the issue's browse URL (`https://<site>/browse/<key>`, or a `self`/`url`
     field if the tool returns one directly)

5. **Map Jira fields to this app's enums** (`prisma/schema.prisma`):

   Priority (`TaskPriority`): Highest→`urgent`, High→`high`, Medium→`medium`,
   Low→`low`, Lowest→`low`. Unknown/missing → `none`.

   Type (`TaskType`): Bug→`bug`, Story→`story`, Epic→`epic`,
   Task/Sub-task/anything else → `task`.

   Status (`TaskStatus`): prefer `status.statusCategory.key` if present —
   `new`→`backlog`, `indeterminate`→`in_progress`, `done`→`done`. If the raw
   status name contains "review" (case-insensitive), use `in_review`
   instead of `in_progress`. Fall back to `backlog` if nothing matches.

6. **Create the task** (reuse the session cookie from step 1):

   ```bash
   curl -s -b /tmp/self-mgmt-cookies.txt -X POST \
     http://localhost:3000/api/projects/<projectId>/tasks \
     -H "Content-Type: application/json" \
     -d '{
       "title": "<summary>",
       "description": "<converted plain-text description>",
       "type": "<mapped type>",
       "priority": "<mapped priority>",
       "status": "<mapped status>",
       "jiraKey": "<issue key>",
       "jiraUrl": "<browse url>"
     }'
   ```

7. **Report back**: tell the user the new task's number (e.g. `DEV-9`), and
   that it carries a "Jira: PROJ-123 ↗" link back to the original ticket
   (visible on the task card and in its detail modal).

## Notes

- This is a one-time clone, not a sync — editing the task later does not
  write back to Jira, and re-running this skill on the same ticket creates
  a second task rather than updating the first (mention this if the user
  asks to "refresh" a cloned ticket — offer to find and update the existing
  task by matching `jiraKey` instead of creating a duplicate).
- Never print or log the full `APP_PIN` value back to the user in chat —
  read it from `.env` and use it directly in the curl call.
- If a project has no `jiraSite`/`jiraProjectKey` set and the user clones
  from it often, suggest they fill those in on that project's Settings page.
