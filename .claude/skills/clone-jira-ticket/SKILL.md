---
name: clone-jira-ticket
description: Clone a Jira ticket into a task in this project's local Self Management app, by reading the ticket in the user's real Chrome (Claude in Chrome — already logged into their Jira). Accepts a Jira issue key (e.g. "PROJ-123") or a Jira ticket URL. Triggers on "clone jira ticket", "import task from jira", "clone task from PROJ-123", or when the user pastes a Jira/Atlassian ticket link and asks to add it as a task.
---

# Clone a Jira ticket into a local task

This skill creates a task in the Self Management app (this repo) from a Jira
issue, by opening the ticket in the user's own Chrome via the **Claude in
Chrome** tools (`mcp__claude-in-chrome__*`) — that browser already has the
user's Jira session, so no API token, OAuth app, or MCP Jira connection is
needed. The app itself has no Jira fetch code; this skill IS the fetch path.

Do NOT use `mcp__Claude_Browser__*` for this — that's a separate sandboxed
browser with no login to the user's Jira. Use `mcp__claude-in-chrome__*`.

## Setup

If the `mcp__claude-in-chrome__*` tools aren't loaded yet (they're deferred
in a fresh session), load them first in one batch:

```
ToolSearch: "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp"
```

## Two supported inputs

1. **Issue key** — e.g. `PROJ-123`. Need a Jira site to build the URL: use
   the target project's `jiraSite` (see step 1) — `https://<jiraSite>/browse/<key>`.
   If the project has no `jiraSite` configured, ask the user for the site or
   the full URL instead of guessing.
2. **Jira ticket URL** — use directly.

## Steps

1. **Authenticate to the local app and find the target project.** Read
   `APP_PIN` from this repo's `.env`, then:

   ```bash
   curl -s -c /tmp/self-mgmt-cookies.txt -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d "{\"pin\":\"<APP_PIN from .env>\"}"
   curl -s -b /tmp/self-mgmt-cookies.txt http://localhost:3000/api/projects
   ```

   If curl fails to connect, the dev server likely isn't running — tell the
   user rather than starting it yourself unprompted, unless they've already
   asked you to run the app this session.

   Match the target project (by board key the user named, e.g. "DEV" — ask
   if not given). Note its local `id` and its `jiraSite` field.

2. **Resolve the ticket URL** (see "Two supported inputs" above).

3. **Open it in the user's Chrome** and read the fields:

   ```
   navigate({ url: "<ticket url>" })
   get_page_text()   # fast pass at the visible text
   read_page()       # accessibility tree, more reliable for locating specific fields
   ```

   If the page shows a Jira login screen instead of the ticket, the user
   isn't logged into Jira in that Chrome profile — tell them and stop; don't
   attempt to log in on their behalf.

   Extract, using whichever of `get_page_text`/`read_page` makes it clearest
   (Jira's DOM/testids change over time, so use judgment rather than a fixed
   selector):
   - **Title** — the large heading with the ticket summary, usually right
     under the breadcrumb/key.
   - **Description** — the main rich-text body in the issue view. Copy as
     plain text (strip formatting).
   - **Type** — the small icon+label right before the issue key (e.g. "Bug",
     "Story", "Task", "Epic", "Sub-task").
   - **Priority** — icon+label in the details panel (right sidebar on
     desktop Jira), e.g. "Highest"/"High"/"Medium"/"Low"/"Lowest".
   - **Status** — the status pill near the top of the issue (e.g.
     "To Do"/"In Progress"/"In Review"/"Done").

   If a field isn't visible without scrolling or expanding something, use
   `computer` (scroll/click) to reveal it rather than guessing.

4. **Map to this app's enums** (`prisma/schema.prisma`):

   Priority (`TaskPriority`): Highest→`urgent`, High→`high`, Medium→`medium`,
   Low→`low`, Lowest→`low`. Unclear/missing → `none`.

   Type (`TaskType`): Bug→`bug`, Story→`story`, Epic→`epic`,
   Task/Sub-task/anything else → `task`.

   Status (`TaskStatus`): if the status name contains "review" → `in_review`.
   Otherwise map by what the status visually represents: not-started-looking
   statuses (To Do, Open, Backlog...) → `backlog`, in-progress-looking
   statuses → `in_progress`, done-looking statuses (Done, Closed,
   Resolved...) → `done`. When genuinely ambiguous, default to `backlog`.

5. **Create the task:**

   ```bash
   curl -s -b /tmp/self-mgmt-cookies.txt -X POST \
     http://localhost:3000/api/projects/<projectId>/tasks \
     -H "Content-Type: application/json" \
     -d '{
       "title": "<summary>",
       "description": "<plain-text description>",
       "type": "<mapped type>",
       "priority": "<mapped priority>",
       "status": "<mapped status>",
       "jiraKey": "<issue key>",
       "jiraUrl": "<ticket url>"
     }'
   ```

6. **Report back**: the new task's number (e.g. `DEV-9`), noting it carries
   a "Jira: PROJ-123 ↗" link back to the original ticket (visible on the
   task card and in its detail modal). Mention any field you weren't
   confident mapping (e.g. an unusual status name) so the user can double
   check it.

## Notes

- One-time clone, not a sync — editing the task later doesn't write back to
  Jira, and re-running this on the same ticket creates a second task. If the
  user asks to "refresh" a cloned ticket, offer to find the existing task by
  matching `jiraKey` and update it (`PATCH /api/tasks/<id>`) instead of
  creating a duplicate.
- Never print or log the full `APP_PIN` value back to the user in chat —
  read it from `.env` and use it directly in the curl call.
- The Create Task form's own "Từ Jira link" tab only *stores* a pasted
  link/key as a reference — it does not fetch. This skill is the only fetch
  path, run by you in chat.
