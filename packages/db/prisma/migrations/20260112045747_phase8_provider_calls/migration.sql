-- CreateEnum
CREATE TYPE "ProviderCallStatus" AS ENUM ('ok', 'empty', 'error');

-- CreateTable
CREATE TABLE "DiscoveryProviderCall" (
    "callId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobType" "DiscoveryJobType" NOT NULL,
    "provider" "DiscoveryProvider" NOT NULL,
    "query" JSONB NOT NULL,
    "status" "ProviderCallStatus" NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "errorType" "ProviderErrorType",
    "errorCode" TEXT,
    "retryable" BOOLEAN,
    "payloadExcerpt" TEXT,
    "invalidUrlCount" INTEGER NOT NULL DEFAULT 0,
    "blockedDomainCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueDomainCount" INTEGER NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveryProviderCall_pkey" PRIMARY KEY ("callId")
);

-- CreateIndex
CREATE INDEX "DiscoveryProviderCall_jobId_timestamp_idx" ON "DiscoveryProviderCall"("jobId", "timestamp");

-- CreateIndex
CREATE INDEX "DiscoveryProviderCall_jobType_timestamp_idx" ON "DiscoveryProviderCall"("jobType", "timestamp");

-- CreateIndex
CREATE INDEX "DiscoveryProviderCall_provider_timestamp_idx" ON "DiscoveryProviderCall"("provider", "timestamp");

-- CreateIndex
CREATE INDEX "DiscoveryProviderCall_status_timestamp_idx" ON "DiscoveryProviderCall"("status", "timestamp");
