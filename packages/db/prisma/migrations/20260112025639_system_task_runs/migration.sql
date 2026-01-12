-- CreateEnum
CREATE TYPE "SystemTaskType" AS ENUM ('CRAWL', 'VERIFY', 'REFRESH_SUMMARY', 'AI_NORMALIZE', 'CLEANUP');

-- CreateEnum
CREATE TYPE "TaskScope" AS ENUM ('GLOBAL', 'STATE', 'CITY', 'LISTING');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('SUCCESS', 'ERROR', 'SKIPPED');

-- CreateTable
CREATE TABLE "SystemTaskRun" (
    "id" TEXT NOT NULL,
    "taskName" TEXT NOT NULL,
    "taskType" "SystemTaskType" NOT NULL,
    "scopeType" "TaskScope" NOT NULL,
    "scopeTarget" TEXT,
    "cronExpr" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "lastStatus" "TaskStatus" NOT NULL,
    "durationMs" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemTaskRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemTaskRun_taskName_createdAt_idx" ON "SystemTaskRun"("taskName", "createdAt");

-- CreateIndex
CREATE INDEX "SystemTaskRun_lastStatus_createdAt_idx" ON "SystemTaskRun"("lastStatus", "createdAt");
