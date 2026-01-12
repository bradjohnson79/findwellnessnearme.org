-- CreateEnum
CREATE TYPE "DiscoveryJobType" AS ENUM ('DISCOVERY_STATE_WAVE', 'DISCOVER_CITY_BATCH', 'MANUAL_SEED');

-- CreateEnum
CREATE TYPE "DiscoveryProvider" AS ENUM ('GOOGLE', 'BING', 'YELP', 'OSM', 'MANUAL', 'BRAVE');

-- CreateEnum
CREATE TYPE "DiscoveryDecision" AS ENUM ('accepted', 'skipped_duplicate', 'skipped_cap', 'skipped_taxonomy', 'skipped_low_confidence', 'skipped_throttle_ranked', 'provider_error');

-- CreateEnum
CREATE TYPE "TaxonomyFinalDecision" AS ENUM ('pass', 'fail');

-- CreateEnum
CREATE TYPE "ProviderErrorType" AS ENUM ('timeout', 'quota', 'malformed', 'empty', 'parse', 'other');

-- CreateTable
CREATE TABLE "DiscoveryAttempt" (
    "attemptId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobType" "DiscoveryJobType" NOT NULL,
    "provider" "DiscoveryProvider" NOT NULL,
    "rawName" TEXT,
    "rawAddress" TEXT,
    "rawCity" TEXT,
    "rawState" TEXT,
    "rawCountry" TEXT,
    "rawCategory" TEXT,
    "normalizedKey" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION,
    "decision" "DiscoveryDecision" NOT NULL,
    "decisionReason" TEXT NOT NULL,
    "taxonomyRuleId" TEXT,
    "capRuleId" TEXT,
    "providerErrorCode" TEXT,
    "providerErrorRetryable" BOOLEAN,
    "providerErrorType" "ProviderErrorType",
    "payloadExcerpt" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveryAttempt_pkey" PRIMARY KEY ("attemptId")
);

-- CreateTable
CREATE TABLE "TaxonomyEvaluation" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "inputCategory" TEXT,
    "matchedCategories" JSONB NOT NULL,
    "excludedCategories" JSONB NOT NULL,
    "finalDecision" "TaxonomyFinalDecision" NOT NULL,
    "taxonomyRuleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxonomyEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscoveryAttempt_jobId_timestamp_idx" ON "DiscoveryAttempt"("jobId", "timestamp");

-- CreateIndex
CREATE INDEX "DiscoveryAttempt_jobType_timestamp_idx" ON "DiscoveryAttempt"("jobType", "timestamp");

-- CreateIndex
CREATE INDEX "DiscoveryAttempt_provider_timestamp_idx" ON "DiscoveryAttempt"("provider", "timestamp");

-- CreateIndex
CREATE INDEX "DiscoveryAttempt_decision_timestamp_idx" ON "DiscoveryAttempt"("decision", "timestamp");

-- CreateIndex
CREATE INDEX "DiscoveryAttempt_normalizedKey_idx" ON "DiscoveryAttempt"("normalizedKey");

-- CreateIndex
CREATE INDEX "DiscoveryAttempt_rawCity_rawState_rawCategory_timestamp_idx" ON "DiscoveryAttempt"("rawCity", "rawState", "rawCategory", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "TaxonomyEvaluation_attemptId_key" ON "TaxonomyEvaluation"("attemptId");

-- AddForeignKey
ALTER TABLE "TaxonomyEvaluation" ADD CONSTRAINT "TaxonomyEvaluation_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "DiscoveryAttempt"("attemptId") ON DELETE RESTRICT ON UPDATE CASCADE;
