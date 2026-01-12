import cronParser from "cron-parser";
import { prisma } from "./prisma.js";
import { SYSTEM_TASKS, SYSTEM_TIMEZONE } from "../systemTasks.js";

function now() {
  return new Date();
}

function nextFromCron(expr: string): Date | null {
  try {
    const interval = cronParser.parseExpression(expr, { tz: SYSTEM_TIMEZONE, currentDate: new Date() });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

function statusFromResult(result: any): "SUCCESS" | "SKIPPED" {
  // Heuristic: if a job returns { selected:0, enqueued:0 } treat as SKIPPED.
  if (result && typeof result === "object") {
    const selected = (result as any).selected;
    const enqueued = (result as any).enqueued;
    if (typeof selected === "number" && typeof enqueued === "number" && selected === 0 && enqueued === 0) {
      return "SKIPPED";
    }
  }
  return "SUCCESS";
}

export async function recordSystemTaskRun(args: {
  taskName: keyof typeof SYSTEM_TASKS;
  run: () => Promise<any>;
}) {
  const def = SYSTEM_TASKS[args.taskName];
  const started = Date.now();
  const lastRunAt = now();
  try {
    const result = await args.run();
    const durationMs = Date.now() - started;
    const status = statusFromResult(result);
    const nextRunAt = nextFromCron(def.cronExpr);
    const note = result ? JSON.stringify(result).slice(0, 900) : def.notes ?? null;

    await prisma.systemTaskRun.create({
      data: {
        taskName: def.taskName,
        taskType: def.taskType,
        scopeType: def.scopeType,
        scopeTarget: def.scopeTarget ?? null,
        cronExpr: def.cronExpr,
        timezone: SYSTEM_TIMEZONE,
        lastRunAt,
        nextRunAt,
        lastStatus: status,
        durationMs,
        note
      }
    });

    return result;
  } catch (e: any) {
    const durationMs = Date.now() - started;
    const nextRunAt = nextFromCron(def.cronExpr);
    const message = String(e?.message ?? e);

    await prisma.systemTaskRun.create({
      data: {
        taskName: def.taskName,
        taskType: def.taskType,
        scopeType: def.scopeType,
        scopeTarget: def.scopeTarget ?? null,
        cronExpr: def.cronExpr,
        timezone: SYSTEM_TIMEZONE,
        lastRunAt,
        nextRunAt,
        lastStatus: "ERROR",
        durationMs,
        note: message.slice(0, 900)
      }
    });

    throw e;
  }
}


