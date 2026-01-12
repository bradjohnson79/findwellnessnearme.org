-- CreateEnum
CREATE TYPE "ClaimRequestType" AS ENUM ('CLAIM', 'CORRECTION');

-- CreateEnum
CREATE TYPE "ClaimRequesterRelationship" AS ENUM ('OWNER', 'STAFF', 'REPRESENTATIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "ClaimRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "ListingClaimRequest" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "requestType" "ClaimRequestType" NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "relationship" "ClaimRequesterRelationship" NOT NULL DEFAULT 'OTHER',
    "fieldsRequested" JSONB NOT NULL,
    "note" TEXT,
    "status" "ClaimRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ListingClaimRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListingClaimRequest_listingId_status_createdAt_idx" ON "ListingClaimRequest"("listingId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ListingClaimRequest_requesterEmail_status_createdAt_idx" ON "ListingClaimRequest"("requesterEmail", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "ListingClaimRequest" ADD CONSTRAINT "ListingClaimRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
