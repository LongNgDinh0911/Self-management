-- AlterTable
ALTER TABLE "WorkflowStep" ADD COLUMN "pauseAfter" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WorkflowRun" ADD COLUMN "worktreePath" TEXT;
