-- AlterTable
ALTER TABLE "Task" ADD COLUMN "archivedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Task_projectId_archivedAt_idx" ON "Task"("projectId", "archivedAt");
