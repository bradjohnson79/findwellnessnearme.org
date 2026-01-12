-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "needsAttention" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Listing_needsAttention_updatedAt_idx" ON "Listing"("needsAttention", "updatedAt");
