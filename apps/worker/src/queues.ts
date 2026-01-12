import { Queue, type ConnectionOptions } from "bullmq";
import { requiredEnv } from "./lib/env.js";

export type JobName =
  | "DISCOVER_LISTINGS"
  | "DISCOVERY_STATE_WAVE"
  | "DISCOVER_CITY_BATCH"
  | "CRAWL_WEBSITE"
  | "EXTRACT_AND_NORMALIZE"
  | "AI_EVALUATE_LISTING"
  | "REVERIFY_LISTINGS"
  | "REFRESH_SUMMARY"
  | "QUALITY_SWEEP"
  | "REFRESH_APPROVED_LISTINGS";

export const QUEUE_NAME = "wellnessnearme-worker";

export function redisConnectionOptions(): ConnectionOptions {
  const raw = requiredEnv("REDIS_URL");
  const u = new URL(raw);
  if (u.protocol !== "redis:" && u.protocol !== "rediss:") {
    throw new Error("REDIS_URL must start with redis:// or rediss://");
  }

  const port = u.port ? Number(u.port) : 6379;
  const db = u.pathname && u.pathname !== "/" ? Number(u.pathname.replace("/", "")) : 0;

  const opts: any = {
    host: u.hostname,
    port,
    db,
    // BullMQ/ioredis option:
    maxRetriesPerRequest: null
  };

  if (u.username) opts.username = decodeURIComponent(u.username);
  if (u.password) opts.password = decodeURIComponent(u.password);

  // TLS for rediss
  if (u.protocol === "rediss:") {
    // Some managed Redis endpoints require SNI; set servername explicitly.
    opts.tls = { servername: u.hostname };
  }

  return opts as ConnectionOptions;
}

export function workerQueue() {
  const connection = redisConnectionOptions();
  return new Queue(QUEUE_NAME, { connection });
}


