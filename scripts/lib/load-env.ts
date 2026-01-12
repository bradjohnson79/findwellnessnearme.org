import { existsSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// Seed scripts run from repo root. We load env in a predictable, boring order:
// 1) .env.local (repo root) if present
// 2) packages/db/.env (common in this repo so far)
// 3) apps/worker/.env.local (developer convenience)
// 4) apps/admin/.env.local (developer convenience)
//
// If DATABASE_URL is already set in the environment, dotenv will not override it.
export function loadSeedEnv(cwd = process.cwd()) {
  const candidates = [
    path.join(cwd, ".env.local"),
    path.join(cwd, "packages/db/.env"),
    path.join(cwd, "apps/worker/.env.local"),
    path.join(cwd, "apps/admin/.env.local")
  ];

  for (const p of candidates) {
    if (existsSync(p)) dotenv.config({ path: p, override: false });
  }
}


