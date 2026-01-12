import { Queue, type ConnectionOptions } from "bullmq";

export const WORKER_QUEUE_NAME = "wellnessnearme-worker";

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

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
  return new Queue(WORKER_QUEUE_NAME, { connection: redisConnectionOptions() });
}

export function crawlJobIdForToday(listingId: string) {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `crawl-${listingId}-${y}${m}${day}`;
}


