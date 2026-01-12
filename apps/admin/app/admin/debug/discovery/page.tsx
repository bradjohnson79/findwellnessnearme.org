import { prisma } from "../../../../src/lib/prisma";

export const dynamic = "force-dynamic";

function groupByDecision(rows: Array<{ decision: string; decisionReason: string }>) {
  const counts: Record<string, number> = {};
  const examples: Record<string, string[]> = {};
  for (const r of rows) {
    counts[r.decision] = (counts[r.decision] ?? 0) + 1;
    if (!examples[r.decision]) examples[r.decision] = [];
    if (examples[r.decision].length < 3) examples[r.decision].push(r.decisionReason);
  }
  return { counts, examples };
}

export default async function DiscoveryDebugPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const sp = searchParams ?? {};
  const city = (Array.isArray(sp.city) ? sp.city[0] : sp.city)?.trim() || "";
  const category = (Array.isArray(sp.category) ? sp.category[0] : sp.category)?.trim() || "";

  const attemptWhere = {
    ...(city ? { rawCity: city } : {}),
    ...(category ? { rawCategory: category } : {})
  } as any;

  const rows = await prisma.discoveryAttempt.findMany({
    where: attemptWhere,
    select: { decision: true, decisionReason: true },
    orderBy: [{ timestamp: "desc" }],
    take: 2000
  });

  const totalAttempts = await prisma.discoveryAttempt.count({ where: attemptWhere });
  const { counts, examples } = groupByDecision(rows as any);

  const providerCallWhere = {
    ...(city ? { query: { path: ["citySlug"], equals: city } } : {}),
    ...(category ? { query: { path: ["category"], equals: category } } : {})
  } as any;

  const providerCalls = await prisma.discoveryProviderCall.findMany({
    where: providerCallWhere,
    select: { status: true, resultCount: true },
    orderBy: [{ timestamp: "desc" }],
    take: 2000
  });
  const providerCallCounts: Record<string, number> = {};
  let providerCallResultTotal = 0;
  for (const c of providerCalls) {
    providerCallCounts[c.status] = (providerCallCounts[c.status] ?? 0) + 1;
    providerCallResultTotal += c.resultCount;
  }

  const decisions = [
    "accepted",
    "skipped_duplicate",
    "skipped_cap",
    "skipped_taxonomy",
    "skipped_low_confidence",
    "skipped_throttle_ranked",
    "provider_error"
  ];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Discovery debug (read-only)</h2>
      <div style={{ fontSize: 12, opacity: 0.8 }}>
        Use this to answer: “Why is this city/category empty?” Data is historical and append-only.
      </div>

      <form method="get" action="/admin/debug/discovery" style={{ display: "flex", gap: 8, alignItems: "end" }}>
        <label style={{ display: "grid", gap: 4 }}>
          City (rawCity)
          <input name="city" defaultValue={city} placeholder="e.g. los-angeles" />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          Category (rawCategory)
          <input name="category" defaultValue={category} placeholder="e.g. wellness" />
        </label>
        <button type="submit">Filter</button>
      </form>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Summary</h3>
        <div style={{ fontSize: 13 }}>
          <div style={{ marginBottom: 8 }}>
            <strong>provider_calls</strong>: ok {providerCallCounts.ok ?? 0}, empty {providerCallCounts.empty ?? 0}, error{" "}
            {providerCallCounts.error ?? 0} (result_count total: {providerCallResultTotal})
          </div>
          <div>
            <strong>total_attempts</strong>: {totalAttempts}
          </div>
          <div>
            <strong>accepted_count</strong>: {counts.accepted ?? 0}
          </div>
        </div>
      </section>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Skipped by reason</h3>
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Decision</th>
              <th>Count</th>
              <th>Examples (max 3)</th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((d) => (
              <tr key={d} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td>{d}</td>
                <td>{counts[d] ?? 0}</td>
                <td style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
                  {(examples[d] ?? []).length ? (examples[d] ?? []).join("\n\n") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}


