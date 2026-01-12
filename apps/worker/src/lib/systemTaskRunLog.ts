import cronParser from "cron-parser";
import { prisma } from "./prisma.js";
import { SYSTEM_TIMEZONE } from "../systemTasks.js";

function nextFromCron(expr: string): Date | null {
  try {
    const interval = cronParser.parseExpression(expr, { tz: SYSTEM_TIMEZONE, currentDate: new Date() });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

export async function logSystemTaskRun(args: {
  taskName: string;
  taskType: "CRAWL" | "VERIFY" | "REFRESH_SUMMARY" | "AI_NORMALIZE" | "CLEANUP";
  scopeType: "GLOBAL" | "STATE" | "CITY" | "LISTING";
  scopeTarget?: string | null;
  cronExpr: string;
  lastStatus: "SUCCESS" | "ERROR" | "SKIPPED";
  durationMs?: number | null;
  note?: string | null;
}) {
  await prisma.systemTaskRun.create({
    data: {
      taskName: args.taskName,
      taskType: args.taskType,
      scopeType: args.scopeType,
      scopeTarget: args.scopeTarget ?? null,
      cronExpr: args.cronExpr,
      timezone: SYSTEM_TIMEZONE,
      lastRunAt: new Date(),
      nextRunAt: nextFromCron(args.cronExpr),
      lastStatus: args.lastStatus,
      durationMs: args.durationMs ?? null,
      note: args.note ?? null
    }
  });
}


