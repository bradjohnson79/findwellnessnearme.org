import type { Queue } from "bullmq";
import { SYSTEM_TASKS } from "./systemTasks.js";
import { SYSTEM_TIMEZONE } from "./systemTasks.js";

// Phase 6A scheduler: registers repeatable cron jobs (idempotent).
// Runs inside the worker process on startup (boring, single-binary deployment).

export async function ensureSchedules(queue: Queue) {
  const entries = [
    { name: "DISCOVERY_STATE_WAVE", jobId: "schedule-discovery-state-wave-hourly" },
    { name: "REFRESH_APPROVED_LISTINGS", jobId: "schedule-refresh-approved-daily" },
    { name: "REVERIFY_LISTINGS", jobId: "schedule-reverify-daily" },
    { name: "REFRESH_SUMMARY", jobId: "schedule-refresh-summary-daily" },
    { name: "QUALITY_SWEEP", jobId: "schedule-quality-sweep-daily" },
    { name: "SCRUB_UNPUBLISHED_LISTINGS", jobId: "schedule-scrub-unpublished-daily" }
  ] as const;

  for (const e of entries) {
    const def = SYSTEM_TASKS[e.name];
    await queue.add(
      e.name,
      {},
      {
        jobId: e.jobId,
        repeat: { pattern: def.cronExpr, tz: SYSTEM_TIMEZONE },
        removeOnComplete: 10,
        removeOnFail: 50
      }
    );
  }
}


