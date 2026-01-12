export const SYSTEM_TIMEZONE: "America/Los_Angeles";

export type SystemTaskType = "CRAWL" | "VERIFY" | "REFRESH_SUMMARY" | "AI_NORMALIZE" | "CLEANUP";
export type TaskScope = "GLOBAL" | "STATE" | "CITY" | "LISTING";

export type SystemTaskDef = {
  taskName: string;
  taskType: SystemTaskType;
  scopeType: TaskScope;
  scopeTarget?: string | null;
  cronExpr: string;
  notes?: string;
};

export const SYSTEM_TASKS: Record<string, SystemTaskDef>;


