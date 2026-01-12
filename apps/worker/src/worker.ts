import { Worker } from "bullmq";
import { QUEUE_NAME, redisConnectionOptions } from "./queues.js";
import type {
  CrawlJobData,
  DiscoverCityBatchJobData,
  DiscoverJobData,
  DiscoveryStateWaveJobData,
  ExtractJobData,
  AiEvaluateJobData
} from "./types.js";
import { runDiscoverJob } from "./jobs/discover.js";
import { runCrawlJob } from "./jobs/crawl.js";
import { runExtractAndNormalizeJob } from "./jobs/extract.js";
import { workerQueue } from "./queues.js";
import { runReverifyListingsJob } from "./jobs/reverify.js";
import { runRefreshSummaryJob } from "./jobs/refreshSummary.js";
import { runQualitySweepJob } from "./jobs/qualitySweep.js";
import { runRefreshApprovedListingsJob } from "./jobs/refreshApproved.js";
import { recordSystemTaskRun } from "./lib/systemTaskRun.js";
import { runDiscoveryStateWaveJob } from "./jobs/discoveryWave.js";
import { runDiscoverCityBatchJob } from "./jobs/discoverCityBatch.js";
import { runAiEvaluateListingJob } from "./jobs/aiEvaluate.js";
import { runScrubUnpublishedJob } from "./jobs/scrubUnpublished.js";

export function startWorker() {
  const connection = redisConnectionOptions();
  const queue = workerQueue();

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case "DISCOVER_LISTINGS":
          return runDiscoverJob(job.data as DiscoverJobData, { queue });
        case "DISCOVERY_STATE_WAVE":
          return runDiscoveryStateWaveJob({ queue, jobId: String(job.id ?? "DISCOVERY_STATE_WAVE") });
        case "DISCOVER_CITY_BATCH":
          return runDiscoverCityBatchJob(job.data as DiscoverCityBatchJobData, {
            queue,
            jobId: String(job.id ?? "DISCOVER_CITY_BATCH")
          });
        case "CRAWL_WEBSITE":
          return runCrawlJob(job.data as CrawlJobData, { queue });
        case "EXTRACT_AND_NORMALIZE":
          return runExtractAndNormalizeJob(job.data as ExtractJobData, { queue });
        case "AI_EVALUATE_LISTING":
          return runAiEvaluateListingJob(job.data as AiEvaluateJobData);
        case "REVERIFY_LISTINGS":
          return recordSystemTaskRun({
            taskName: "REVERIFY_LISTINGS",
            run: () => runReverifyListingsJob({ queue })
          });
        case "REFRESH_SUMMARY":
          // Both cron-driven and targeted follow-up calls use the same job name.
          return recordSystemTaskRun({
            taskName: "REFRESH_SUMMARY",
            run: () => runRefreshSummaryJob(job.data as any)
          });
        case "QUALITY_SWEEP":
          return recordSystemTaskRun({
            taskName: "QUALITY_SWEEP",
            run: () => runQualitySweepJob()
          });
        case "REFRESH_APPROVED_LISTINGS":
          return recordSystemTaskRun({
            taskName: "REFRESH_APPROVED_LISTINGS",
            run: () => runRefreshApprovedListingsJob({ queue })
          });
        case "SCRUB_UNPUBLISHED_LISTINGS":
          return recordSystemTaskRun({
            taskName: "SCRUB_UNPUBLISHED_LISTINGS",
            run: () => runScrubUnpublishedJob()
          });
        default:
          throw new Error(`Unknown job: ${job.name}`);
      }
    },
    {
      connection,
      // Keep concurrency low to enforce politeness.
      concurrency: 2
    }
  );

  worker.on("failed", (job, err) => {
    console.error("job failed", { id: job?.id, name: job?.name, err: err?.message });
  });

  worker.on("completed", (job) => {
    console.log("job completed", { id: job.id, name: job.name });
  });

  return worker;
}


