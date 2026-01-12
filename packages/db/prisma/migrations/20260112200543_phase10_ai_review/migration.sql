-- CreateEnum
CREATE TYPE "ApprovalSource" AS ENUM ('HUMAN', 'AI');

-- CreateEnum
CREATE TYPE "AIReviewVerdict" AS ENUM ('PASS', 'FAIL');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "aiNeedsHumanReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "approvalConfidence" DOUBLE PRECISION,
ADD COLUMN     "approvalSource" "ApprovalSource";

-- CreateTable
CREATE TABLE "AIReview" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "verdict" "AIReviewVerdict" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasons" TEXT[],
    "flags" TEXT[],
    "modelVersion" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawResponse" TEXT,

    CONSTRAINT "AIReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIReview_listingId_reviewedAt_idx" ON "AIReview"("listingId", "reviewedAt");

-- CreateIndex
CREATE INDEX "AIReview_verdict_reviewedAt_idx" ON "AIReview"("verdict", "reviewedAt");

-- CreateIndex
CREATE INDEX "Listing_aiNeedsHumanReview_updatedAt_idx" ON "Listing"("aiNeedsHumanReview", "updatedAt");

-- CreateIndex
CREATE INDEX "Listing_approvalSource_updatedAt_idx" ON "Listing"("approvalSource", "updatedAt");

-- AddForeignKey
ALTER TABLE "AIReview" ADD CONSTRAINT "AIReview_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
