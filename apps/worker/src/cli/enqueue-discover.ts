import { loadEnv } from "../lib/load-env.js";
import { workerQueue } from "../queues.js";
import type { DiscoverCandidate } from "../types.js";

// MVP: enqueue discovery with a JSON file of candidates.
// Usage:
//   npm run -w @wellnessnearme/worker enqueue:discover -- ./candidates.json "optional query text"
//
// candidates.json format:
//   [{ "displayName": "...", "websiteUrl": "https://...", "city": "...", "state": "CA" }]

const [jsonPath, queryText] = process.argv.slice(2);
if (!jsonPath) {
  console.error("Missing path to candidates JSON");
  process.exit(1);
}

loadEnv();

// When invoked via `npm -w`, the process cwd becomes the workspace directory.
// Use INIT_CWD (set by npm) to resolve relative paths from the caller's directory.
const { readFile } = await import("node:fs/promises");
const { resolve } = await import("node:path");
const baseDir = process.env.INIT_CWD || process.cwd();
const resolvedPath = resolve(baseDir, jsonPath);
const buf = await readFile(resolvedPath, "utf8");
const candidates = JSON.parse(buf) as DiscoverCandidate[];

const queue = workerQueue();
await queue.add(
  "DISCOVER_LISTINGS",
  { candidates, queryText: queryText ?? null },
  { removeOnComplete: 100, removeOnFail: 100 }
);

console.log(`enqueued DISCOVER_LISTINGS (${candidates.length} candidates)`);
process.exit(0);


