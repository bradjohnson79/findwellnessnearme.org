-- AlterTable
ALTER TABLE "AIReview" ADD COLUMN     "crawlAttemptId" TEXT;

-- CreateIndex
CREATE INDEX "AIReview_crawlAttemptId_reviewedAt_idx" ON "AIReview"("crawlAttemptId", "reviewedAt");

-- AddForeignKey
ALTER TABLE "AIReview" ADD CONSTRAINT "AIReview_crawlAttemptId_fkey" FOREIGN KEY ("crawlAttemptId") REFERENCES "CrawlAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
