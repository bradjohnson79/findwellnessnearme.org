import { existsSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// Worker runs outside Next.js, so we explicitly load local env files.
// We prefer `.env.local` (developer machine) and then `.env` (fallback).
export function loadEnv() {
  const cwd = process.cwd();
  const envLocal = path.join(cwd, ".env.local");
  const env = path.join(cwd, ".env");

  if (existsSync(envLocal)) dotenv.config({ path: envLocal });
  if (existsSync(env)) dotenv.config({ path: env });
}


