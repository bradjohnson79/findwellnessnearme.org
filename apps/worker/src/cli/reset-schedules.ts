import { loadEnv } from "../lib/load-env.js";
import { workerQueue } from "../queues.js";
import { ensureSchedules } from "../scheduler.js";

/**
 * Reset BullMQ repeatable cron schedules for this worker.
 *
 * By default:
 * - removes all repeatable jobs for the queue
 * - re-adds schedules via ensureSchedules()
 * - enqueues an immediate DISCOVERY_STATE_WAVE run (so you don't wait for the next cron tick)
 *
 * Usage:
 *   tsx src/cli/reset-schedules.ts
 *   tsx src/cli/reset-schedules.ts --no-run-now
 *   tsx src/cli/reset-schedules.ts --purge-queue
 */

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

async function purgeQueue(queue: ReturnType<typeof workerQueue>) {
  // Remove waiting + delayed jobs first (prevents stale config payloads from running).
  await queue.drain(true);

  // Clean completed/failed job history (optional but helps "start from beginning" feel).
  // 0ms grace => clean everything.
  const types = ["completed", "failed"] as const;
  for (const t of types) {
    // Clean in batches to avoid very large result sets.
    // Loop until no more jobs are removed.
    for (let i = 0; i < 20; i++) {
      const removed = await queue.clean(0, 1000, t);
      if (!removed.length) break;
    }
  }
}

async function main() {
  loadEnv();
  const queue = workerQueue();

  const doPurge = hasFlag("--purge-queue");
  if (doPurge) {
    await purgeQueue(queue);
  }

  const repeatables = await queue.getRepeatableJobs();
  for (const r of repeatables) {
    // Remove by key is the safest canonical method.
    await queue.removeRepeatableByKey(r.key);
  }

  await ensureSchedules(queue);

  if (!hasFlag("--no-run-now")) {
    await queue.add(
      "DISCOVERY_STATE_WAVE",
      {},
      {
        jobId: `manual-discovery-state-wave-${Date.now()}`,
        removeOnComplete: 50,
        removeOnFail: 200
      }
    );
  }

  await queue.close();
  console.log(
    JSON.stringify(
      {
        purgedQueue: doPurge,
        removedRepeatables: repeatables.length,
        readded: true,
        ranNow: !hasFlag("--no-run-now")
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("reset-schedules failed", e);
  process.exit(1);
});


