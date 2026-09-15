-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repoUrl" TEXT,
    "repoLocalPath" TEXT,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "jiraSite" TEXT,
    "jiraProjectKey" TEXT,
    "categoryId" TEXT,
    "nextTaskNumber" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Project_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("archived", "color", "createdAt", "defaultBranch", "id", "jiraProjectKey", "jiraSite", "key", "name", "nextTaskNumber", "repoLocalPath", "repoUrl") SELECT "archived", "color", "createdAt", "defaultBranch", "id", "jiraProjectKey", "jiraSite", "key", "name", "nextTaskNumber", "repoLocalPath", "repoUrl" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_key_key" ON "Project"("key");
CREATE INDEX "Project_categoryId_idx" ON "Project"("categoryId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
