import { loadEnv } from "./lib/load-env.js";
import { startWorker } from "./worker.js";
import { workerQueue } from "./queues.js";
import { ensureSchedules } from "./scheduler.js";

// This process runs BullMQ workers for Tier-1 discovery/verification/normalization.
// It does not publish listings (never sets moderationStatus=APPROVED).

loadEnv();
startWorker();
// Register cron-style repeatable jobs.
ensureSchedules(workerQueue()).catch((e) => console.error("scheduler failed", e));
console.log("worker started");


