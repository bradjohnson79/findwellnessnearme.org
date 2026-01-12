import { prisma } from "../lib/prisma.js";
import { discoveryConfig } from "../lib/discoveryConfig.js";
import type { Queue } from "bullmq";
import { logSystemTaskRun } from "../lib/systemTaskRunLog.js";
import { SYSTEM_TASKS } from "../systemTasks.js";

function stableHash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function currentHourUtc() {
  const d = new Date();
  return d.getUTCHours();
}

function batchKey(stateSlug: string, batchIndex: number) {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  // One batch job per state per hour (idempotent); safe to re-run.
  return `discover-city-batch-${stateSlug}-${y}${m}${day}-h${String(currentHourUtc()).padStart(2, "0")}-b${batchIndex}`;
}

export async function runDiscoveryStateWaveJob(deps: { queue: Queue; jobId: string }) {
  const cfg = discoveryConfig();
  const started = Date.now();
  const cronExpr = SYSTEM_TASKS.DISCOVERY_STATE_WAVE.cronExpr;

  if (!cfg.activeStateSlugs.length || !cfg.modalitySlugs.length) {
    await logSystemTaskRun({
      taskName: "DISCOVERY_STATE_WAVE",
      taskType: "CRAWL",
      scopeType: "GLOBAL",
      cronExpr,
      lastStatus: "SKIPPED",
      durationMs: Date.now() - started,
      note: "No active states or modalities configured"
    });
    return { enqueued: 0, states: 0 };
  }

  // Load canonical states (US only).
  const states = await prisma.state.findMany({
    where: { slug: { in: cfg.activeStateSlugs }, country: { iso2: "US" } },
    select: { id: true, slug: true }
  });

  let enqueued = 0;
  let statesProcessed = 0;

  for (const state of states) {
    if (enqueued >= cfg.maxDiscoveryBatchesPerRun) break;
    statesProcessed++;

    const cities = await prisma.city.findMany({
      where: { stateId: state.id },
      select: { slug: true },
      orderBy: [{ slug: "asc" }]
    });
    if (!cities.length) continue;

    const batchSize = Math.max(1, Math.min(cfg.cityBatchSize, 50));
    const totalBatches = Math.ceil(cities.length / batchSize);
    const seed = stableHash(`${state.slug}:${new Date().toISOString().slice(0, 10)}`); // day-stable
    const batchIndex = (seed + currentHourUtc()) % totalBatches;
    const start = batchIndex * batchSize;
    const batch = cities.slice(start, start + batchSize).map((c) => c.slug);
    if (!batch.length) continue;

    await deps.queue.add(
      "DISCOVER_CITY_BATCH",
      { stateSlug: state.slug, citySlugs: batch, modalitySlugs: cfg.modalitySlugs },
      {
        jobId: batchKey(state.slug, batchIndex),
        removeOnComplete: 50,
        removeOnFail: 200
      }
    );
    enqueued++;
  }

  await logSystemTaskRun({
    taskName: "DISCOVERY_STATE_WAVE",
    taskType: "CRAWL",
    scopeType: "GLOBAL",
    cronExpr,
    lastStatus: enqueued ? "SUCCESS" : "SKIPPED",
    durationMs: Date.now() - started,
    note: JSON.stringify({ activeStates: cfg.activeStateSlugs.length, statesMatched: states.length, enqueued })
  });

  return { enqueued, states: statesProcessed };
}


