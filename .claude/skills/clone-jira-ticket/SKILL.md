---
name: clone-jira-ticket
description: Clone a Jira ticket into a task in this project's local Self Management app. Accepts a Jira issue key (e.g. "PROJ-123") or a Jira ticket URL. Triggers on "clone jira ticket", "import task from jira", "clone task from PROJ-123", or when the user pastes a Jira/Atlassian ticket link and asks to add it as a task.
---

# Clone a Jira ticket into a local task

This skill creates a task in the Self Management app (this repo) from a Jira
issue, using the Atlassian MCP tools already connected in this session
(`mcp__*atlassian*` / the Teamwork Graph + Jira tools — `getJiraIssue`,
`getAccessibleAtlassianResources`, etc). There is no separate Jira REST
integration inside the app itself — this skill IS the "fetch from Jira"
feature, run by you (Claude Code) on the user's behalf.

## Two supported inputs

1. **Issue key** — e.g. `PROJ-123`. Use directly.
2. **Jira ticket URL** — e.g. `https://<site>.atlassian.net/browse/PROJ-123`
   or a Jira Cloud URL with `/jira/software/projects/PROJ/issues/PROJ-123`.
   Extract the issue key with a regex on the path: `([A-Z][A-Z0-9]+-\d+)`.

Both converge on the same fetch step below — the "via link" case just adds
one extra step (parse the key out of the URL first).

## Steps

1. **Resolve the issue key** from the user's input (see above). If you can't
   confidently extract a key from a pasted URL, ask the user for the key
   instead of guessing.

2. **Resolve the Atlassian site** (cloudId). If not already known this
   session, call `getAccessibleAtlassianResources` and pick the matching
   site (ask the user if more than one and it's not obvious from the URL's
   subdomain).

3. **Fetch the issue** with `getJiraIssue` (cloudId + issue key). Read:
   - `summary` → task title
   - `description` → may come back as Atlassian Document Format (ADF) JSON.
     Convert to plain text: walk the doc tree, concatenate `text` values
     from `text` nodes, insert a blank line between top-level block nodes
     (paragraphs, lists, headings). Don't try to preserve rich formatting —
     plain text is fine, this app's description field is a plain textarea.
   - `priority.name`, `issuetype.name`, `status.name` / `status.statusCategory.key`
   - the issue's browse URL (`https://<site>/browse/<key>`, or a `self`/`url`
     field if the tool returns one directly)

4. **Map Jira fields to this app's enums** (`prisma/schema.prisma`):

   Priority (`TaskPriority`): Highest→`urgent`, High→`high`, Medium→`medium`,
   Low→`low`, Lowest→`low`. Unknown/missing → `none`.

   Type (`TaskType`): Bug→`bug`, Story→`story`, Epic→`epic`,
   Task/Sub-task/anything else → `task`.

   Status (`TaskStatus`): prefer `status.statusCategory.key` if present —
   `new`→`backlog`, `indeterminate`→`in_progress`, `done`→`done`. If the raw
   status name contains "review" (case-insensitive), use `in_review`
   instead of `in_progress`. Fall back to `backlog` if nothing matches.

5. **Find the target local project.** If the user named a board/project key
   (e.g. "DEV"), use that. Otherwise ask which project to add it to — don't
   guess. You'll need the project's local `id` (not its `key`) to call the
   create-task endpoint; get it from `GET /api/projects` (step 6 gives you
   the authenticated session to call this).

6. **Authenticate to the local app.** The app is PIN-protected
   (`proxy.ts`). Read `APP_PIN` from this repo's `.env`, then:

   ```bash
   curl -s -c /tmp/self-mgmt-cookies.txt -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d "{\"pin\":\"<APP_PIN from .env>\"}"
   ```

   If that fails to connect, the dev server likely isn't running — tell the
   user rather than trying to start it yourself unprompted, unless they've
   already asked you to run the app this session.

   Then list projects to resolve the target project's `id`:

   ```bash
   curl -s -b /tmp/self-mgmt-cookies.txt http://localhost:3000/api/projects
   ```

7. **Create the task:**

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

8. **Report back**: tell the user the new task's number (e.g. `DEV-9`), and
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
