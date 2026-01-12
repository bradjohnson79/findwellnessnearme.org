export const SYSTEM_TIMEZONE = "America/Los_Angeles";

/**
 * Single source of truth for scheduled task definitions.
 *
 * - Read-only consumers (admin) use this to compute derived next-run times.
 * - Worker uses this to register repeatable jobs.
 *
 * Env overrides are allowed only to support testing. In production, leave defaults.
 */
export const SYSTEM_TASKS = {
  DISCOVERY_STATE_WAVE: {
    taskName: "DISCOVERY_STATE_WAVE",
    taskType: "CRAWL",
    scopeType: "GLOBAL",
    cronExpr: (process.env.DISCOVERY_STATE_WAVE_CRON?.trim() || "0 * * * *"),
    notes: "Config-driven state×city discovery wave; enqueues DISCOVER_CITY_BATCH jobs."
  },
  REFRESH_APPROVED_LISTINGS: {
    taskName: "REFRESH_APPROVED_LISTINGS",
    taskType: "VERIFY",
    scopeType: "GLOBAL",
    cronExpr: "50 2 * * *",
    notes: "Select approved listings needing refresh; enqueue CRAWL_WEBSITE; mark overdue verified as STALE."
  },
  REVERIFY_LISTINGS: {
    taskName: "REVERIFY_LISTINGS",
    taskType: "VERIFY",
    scopeType: "GLOBAL",
    cronExpr: "10 3 * * *",
    notes: "Reverify verified listings past staleness cutoff; enqueue CRAWL_WEBSITE."
  },
  REFRESH_SUMMARY: {
    taskName: "REFRESH_SUMMARY",
    taskType: "REFRESH_SUMMARY",
    scopeType: "GLOBAL",
    cronExpr: "30 3 * * *",
    notes: "Refresh missing/stale summaries (neutral, factual); log system action."
  },
  QUALITY_SWEEP: {
    taskName: "QUALITY_SWEEP",
    taskType: "CLEANUP",
    scopeType: "GLOBAL",
    cronExpr: "50 3 * * *",
    notes: "Flag attention for repeated failures / robots changes / verification issues."
  },
  SCRUB_UNPUBLISHED_LISTINGS: {
    taskName: "SCRUB_UNPUBLISHED_LISTINGS",
    taskType: "CLEANUP",
    scopeType: "GLOBAL",
    cronExpr: "20 4 * * *",
    notes: "Soft-delete listings that have remained unpublished for >= 7 days (rule-of-thumb cleanup)."
  }
};


