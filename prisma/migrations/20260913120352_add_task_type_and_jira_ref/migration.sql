-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'backlog',
    "priority" TEXT NOT NULL DEFAULT 'none',
    "type" TEXT NOT NULL DEFAULT 'task',
    "estimate" INTEGER,
    "dueDate" DATETIME,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "jiraKey" TEXT,
    "jiraUrl" TEXT,
    "projectId" TEXT NOT NULL,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("createdAt", "description", "dueDate", "estimate", "id", "number", "order", "priority", "projectId", "status", "title", "updatedAt") SELECT "createdAt", "description", "dueDate", "estimate", "id", "number", "order", "priority", "projectId", "status", "title", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_projectId_status_idx" ON "Task"("projectId", "status");
CREATE UNIQUE INDEX "Task_projectId_number_key" ON "Task"("projectId", "number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
