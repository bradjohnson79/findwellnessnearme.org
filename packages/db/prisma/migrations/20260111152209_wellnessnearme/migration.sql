-- CreateEnum
CREATE TYPE "ListingKind" AS ENUM ('PRACTITIONER', 'BUSINESS');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'UNPUBLISHED', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'STALE', 'FAILED');

-- CreateEnum
CREATE TYPE "DiscoverySourceType" AS ENUM ('SEARCH', 'MANUAL', 'PRACTITIONER_SUBMISSION');

-- CreateEnum
CREATE TYPE "CrawlPurpose" AS ENUM ('VERIFICATION', 'REFRESH');

-- CreateEnum
CREATE TYPE "CrawlStatus" AS ENUM ('SUCCESS', 'BLOCKED_ROBOTS', 'HTTP_ERROR', 'TIMEOUT', 'PARSE_ERROR', 'UNKNOWN_ERROR');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('SYSTEM', 'HUMAN');

-- CreateEnum
CREATE TYPE "ModerationAction" AS ENUM ('SUBMIT_FOR_REVIEW', 'APPROVE', 'REJECT', 'UNPUBLISH', 'OPT_OUT', 'RESTORE');

-- CreateEnum
CREATE TYPE "ModerationReasonCode" AS ENUM ('DUPLICATE', 'NOT_TIER1', 'NO_WEBSITE', 'OUTSIDE_US', 'NOT_PRACTITIONER_OR_BUSINESS', 'REQUESTED_REMOVAL', 'OTHER');

-- CreateEnum
CREATE TYPE "RemovalRequestChannel" AS ENUM ('EMAIL', 'WEBFORM', 'PHONE', 'MAIL', 'OTHER');

-- CreateEnum
CREATE TYPE "RemovalRequesterRelationship" AS ENUM ('PRACTITIONER', 'BUSINESS_OWNER', 'AUTHORIZED_REP', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RemovalRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "kind" "ListingKind" NOT NULL,
    "displayName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "websiteUrl" TEXT NOT NULL,
    "websiteDomain" TEXT NOT NULL,
    "contactPhoneE164" TEXT,
    "contactEmail" TEXT,
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'DRAFT',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "lastVerifiedAt" TIMESTAMP(3),
    "lastCrawledAt" TIMESTAMP(3),
    "optedOutAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "iso2" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "State" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "uspsCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingLocation" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "street1" TEXT,
    "street2" TEXT,
    "postalCode" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Modality" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Modality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingModality" (
    "listingId" TEXT NOT NULL,
    "modalityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingModality_pkey" PRIMARY KEY ("listingId","modalityId")
);

-- CreateTable
CREATE TABLE "ListingDiscoveryEvent" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "sourceType" "DiscoverySourceType" NOT NULL,
    "sourceUrl" TEXT,
    "queryText" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingDiscoveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlAttempt" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "purpose" "CrawlPurpose" NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "CrawlStatus" NOT NULL,
    "httpStatus" INTEGER,
    "robotsAllowed" BOOLEAN,
    "contentSha256" TEXT,
    "storageKey" TEXT,
    "extractedData" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrawlAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingModerationEvent" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "action" "ModerationAction" NOT NULL,
    "reasonCode" "ModerationReasonCode",
    "note" TEXT,
    "actorType" "ActorType" NOT NULL,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingModerationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingRemovalRequest" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "channel" "RemovalRequestChannel" NOT NULL,
    "requesterRelationship" "RemovalRequesterRelationship" NOT NULL DEFAULT 'UNKNOWN',
    "requesterName" TEXT,
    "requesterEmail" TEXT,
    "requesterPhone" TEXT,
    "note" TEXT,
    "status" "RemovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingRemovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Listing_slug_key" ON "Listing"("slug");

-- CreateIndex
CREATE INDEX "Listing_moderationStatus_updatedAt_idx" ON "Listing"("moderationStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "Listing_verificationStatus_updatedAt_idx" ON "Listing"("verificationStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "Listing_websiteDomain_idx" ON "Listing"("websiteDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Country_iso2_key" ON "Country"("iso2");

-- CreateIndex
CREATE UNIQUE INDEX "Country_slug_key" ON "Country"("slug");

-- CreateIndex
CREATE INDEX "State_countryId_name_idx" ON "State"("countryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "State_countryId_uspsCode_key" ON "State"("countryId", "uspsCode");

-- CreateIndex
CREATE UNIQUE INDEX "State_countryId_slug_key" ON "State"("countryId", "slug");

-- CreateIndex
CREATE INDEX "City_stateId_name_idx" ON "City"("stateId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "City_stateId_slug_key" ON "City"("stateId", "slug");

-- CreateIndex
CREATE INDEX "ListingLocation_listingId_idx" ON "ListingLocation"("listingId");

-- CreateIndex
CREATE INDEX "ListingLocation_cityId_idx" ON "ListingLocation"("cityId");

-- CreateIndex
CREATE INDEX "ListingLocation_listingId_isPrimary_idx" ON "ListingLocation"("listingId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "Modality_slug_key" ON "Modality"("slug");

-- CreateIndex
CREATE INDEX "Modality_parentId_idx" ON "Modality"("parentId");

-- CreateIndex
CREATE INDEX "Modality_isActive_idx" ON "Modality"("isActive");

-- CreateIndex
CREATE INDEX "ListingModality_modalityId_idx" ON "ListingModality"("modalityId");

-- CreateIndex
CREATE INDEX "ListingDiscoveryEvent_listingId_discoveredAt_idx" ON "ListingDiscoveryEvent"("listingId", "discoveredAt");

-- CreateIndex
CREATE INDEX "ListingDiscoveryEvent_sourceType_discoveredAt_idx" ON "ListingDiscoveryEvent"("sourceType", "discoveredAt");

-- CreateIndex
CREATE INDEX "CrawlAttempt_listingId_startedAt_idx" ON "CrawlAttempt"("listingId", "startedAt");

-- CreateIndex
CREATE INDEX "CrawlAttempt_status_startedAt_idx" ON "CrawlAttempt"("status", "startedAt");

-- CreateIndex
CREATE INDEX "CrawlAttempt_contentSha256_idx" ON "CrawlAttempt"("contentSha256");

-- CreateIndex
CREATE INDEX "ListingModerationEvent_listingId_createdAt_idx" ON "ListingModerationEvent"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "ListingModerationEvent_action_createdAt_idx" ON "ListingModerationEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "ListingRemovalRequest_listingId_status_idx" ON "ListingRemovalRequest"("listingId", "status");

-- CreateIndex
CREATE INDEX "ListingRemovalRequest_status_createdAt_idx" ON "ListingRemovalRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "State" ADD CONSTRAINT "State_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingLocation" ADD CONSTRAINT "ListingLocation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingLocation" ADD CONSTRAINT "ListingLocation_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Modality" ADD CONSTRAINT "Modality_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Modality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingModality" ADD CONSTRAINT "ListingModality_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingModality" ADD CONSTRAINT "ListingModality_modalityId_fkey" FOREIGN KEY ("modalityId") REFERENCES "Modality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingDiscoveryEvent" ADD CONSTRAINT "ListingDiscoveryEvent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlAttempt" ADD CONSTRAINT "CrawlAttempt_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingModerationEvent" ADD CONSTRAINT "ListingModerationEvent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingRemovalRequest" ADD CONSTRAINT "ListingRemovalRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
