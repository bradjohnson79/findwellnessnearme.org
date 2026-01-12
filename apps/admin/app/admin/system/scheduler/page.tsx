import { prisma } from "../../../../src/lib/prisma";
import cronParser from "cron-parser";
import { SYSTEM_TASKS, SYSTEM_TIMEZONE } from "@wellnessnearme/system";

export const dynamic = "force-dynamic";

const TZ = SYSTEM_TIMEZONE;

function fmt(date: Date | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function scheduleLabel(expr: string): string {
  const e = expr.trim();
  // Basic, deterministic heuristics (avoid being clever).
  if (/^\d+\s+\*\s+\*\s+\*\s+\*$/.test(e)) return "Hourly";
  if (/^\d+\s+\d+\s+\*\s+\*\s+\*$/.test(e)) return "Daily";
  if (/^\d+\s+\d+\s+\*\s+\*\s+\d+$/.test(e)) return "Weekly";
  return "Cron";
}

function nextRun(expr: string): Date | null {
  try {
    const interval = cronParser.parseExpression(expr, { tz: TZ, currentDate: new Date() });
    return interval.next().toDate();
  } catch (e) {
    console.warn("cron parse failed", { expr, err: (e as any)?.message });
    return null;
  }
}

export default async function SystemSchedulerPage() {
  // Last 200 runs (read-only flight-board view).
  const runs = await prisma.systemTaskRun.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 200
  });

  // Latest per taskName (for summary table).
  const latestByTask = new Map<string, (typeof runs)[number]>();
  for (const r of runs) {
    if (!latestByTask.has(r.taskName)) latestByTask.set(r.taskName, r);
  }
  const tasks = Array.from(latestByTask.values()).sort((a, b) => a.taskName.localeCompare(b.taskName));

  const scheduled = Object.values(SYSTEM_TASKS)
    .map((t) => ({
      taskName: t.taskName,
      cronExpr: t.cronExpr,
      schedule: scheduleLabel(t.cronExpr),
      nextRunAt: nextRun(t.cronExpr)
    }))
    .sort((a, b) => a.taskName.localeCompare(b.taskName));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>System scheduler (read-only)</h2>
      <div style={{ fontSize: 12, opacity: 0.8 }}>
        Times shown in {TZ}. No manual triggers or controls.
      </div>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Scheduled tasks (estimated)</h3>
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Task</th>
              <th>Schedule</th>
              <th>Next run (PST)</th>
            </tr>
          </thead>
          <tbody>
            {scheduled.map((t) => (
              <tr key={t.taskName} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td>{t.taskName}</td>
                <td>
                  <div>{t.schedule}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.8 }}>{t.cronExpr}</div>
                </td>
                <td>{fmt(t.nextRunAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
          Next run times are estimated from scheduler configuration. Actual executions appear below once completed.
        </div>
      </section>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Tasks (latest)</h3>
        {tasks.length ? (
          <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>Job name</th>
                <th>Job type</th>
                <th>Scope</th>
                <th>Target</th>
                <th>Last run</th>
                <th>Last status</th>
                <th>Duration (ms)</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td>{t.taskName}</td>
                  <td>{t.taskType}</td>
                  <td>{t.scopeType}</td>
                  <td style={{ fontSize: 12 }}>{t.scopeTarget ?? "—"}</td>
                  <td>{fmt(t.lastRunAt ?? null)}</td>
                  <td>{t.lastStatus}</td>
                  <td>{t.durationMs ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            No task runs recorded yet. Worker will populate this as scheduled jobs run.
          </div>
        )}
      </section>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Recent runs (last 200)</h3>
        {runs.length ? (
          <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>Ran at (PST)</th>
                <th>Job name</th>
                <th>Status</th>
                <th>Duration (ms)</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td>{fmt(r.lastRunAt ?? r.createdAt)}</td>
                  <td>{r.taskName}</td>
                  <td>{r.lastStatus}</td>
                  <td>{r.durationMs ?? "—"}</td>
                  <td style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{r.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.8 }}>No runs recorded yet.</div>
        )}
      </section>
    </div>
  );
}


