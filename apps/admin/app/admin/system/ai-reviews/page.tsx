import { prisma } from "../../../../src/lib/prisma";

export const dynamic = "force-dynamic";

function days(n: number) {
  return n * 24 * 60 * 60 * 1000;
}

export default async function SystemAiReviewsPage() {
  const since = new Date(Date.now() - days(7));

  const [countsByVerdict, countsByModel, recent, autoApprovedEvents, routedToHuman, confidences] =
    await Promise.all([
    prisma.aIReview.groupBy({
      by: ["verdict"],
      where: { reviewedAt: { gt: since } },
      _count: { _all: true }
    }),
    prisma.aIReview.groupBy({
      by: ["modelVersion"],
      where: { reviewedAt: { gt: since } },
      _count: { _all: true }
    }),
    prisma.aIReview.findMany({
      where: { reviewedAt: { gt: since } },
      orderBy: [{ reviewedAt: "desc" }],
      take: 200,
      select: {
        id: true,
        listingId: true,
        verdict: true,
        confidence: true,
        flags: true,
        modelVersion: true,
        reviewedAt: true
      }
    }),
    prisma.listingModerationEvent.count({
      where: { action: "AI_AUTO_APPROVED", createdAt: { gt: since } }
    }),
    prisma.listing.count({
      where: { aiNeedsHumanReview: true, aiReviews: { some: { reviewedAt: { gt: since } } } }
    }),
    prisma.aIReview.findMany({
      where: { reviewedAt: { gt: since } },
      select: { confidence: true },
      take: 5000
    })
  ]);

  const verdictCounts = new Map<string, number>();
  for (const r of countsByVerdict as Array<{ verdict: string; _count: { _all: number } }>) {
    verdictCounts.set(r.verdict, r._count._all);
  }
  const pass = verdictCounts.get("PASS") ?? 0;
  const fail = verdictCounts.get("FAIL") ?? 0;
  const total = pass + fail;
  const passRate = total ? Math.round((pass / total) * 100) : 0;
  const autoApproveRate = total ? Math.round((autoApprovedEvents / total) * 100) : 0;

  // Confidence distribution buckets (approx; capped to first 5k for speed).
  const buckets = [
    { label: "0.00–0.49", min: 0.0, max: 0.5, count: 0 },
    { label: "0.50–0.69", min: 0.5, max: 0.7, count: 0 },
    { label: "0.70–0.89", min: 0.7, max: 0.9, count: 0 },
    { label: "0.90–1.00", min: 0.9, max: 1.00001, count: 0 }
  ];
  for (const r of confidences) {
    const c = r.confidence;
    const b = buckets.find((x) => c >= x.min && c < x.max);
    if (b) b.count++;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>AI reviews (last 7 days)</h2>
      <div style={{ fontSize: 12, opacity: 0.85 }}>
        Total: <strong>{total}</strong> · PASS {pass} · FAIL {fail} · Pass rate {passRate}% · Auto-approved{" "}
        {autoApprovedEvents} ({autoApproveRate}%) · Routed to human {routedToHuman}
      </div>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Confidence distribution</h3>
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Bucket</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.label} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td>{b.label}</td>
                <td>{b.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
          Note: bucket counts are computed from up to the first 5,000 AI reviews in the window.
        </div>
      </section>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Model versions</h3>
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Model</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {countsByModel
              .slice()
              .sort((a: any, b: any) => (b._count._all ?? 0) - (a._count._all ?? 0))
              .map((m: any) => (
                <tr key={m.modelVersion} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td>{m.modelVersion}</td>
                  <td>{m._count._all}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Recent reviews (last 200)</h3>
        {recent.length ? (
          <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>At</th>
                <th>Listing</th>
                <th>Verdict</th>
                <th>Confidence</th>
                <th>Flags</th>
                <th>Model</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ fontSize: 12 }}>{r.reviewedAt.toISOString()}</td>
                  <td>
                    <a href={`/admin/listings/${r.listingId}`}>{r.listingId}</a>
                  </td>
                  <td>{r.verdict}</td>
                  <td>{r.confidence.toFixed(2)}</td>
                  <td style={{ fontSize: 12 }}>{r.flags.length ? r.flags.join(", ") : "—"}</td>
                  <td style={{ fontSize: 12 }}>{r.modelVersion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.8 }}>No AI reviews recorded yet.</div>
        )}
      </section>
    </div>
  );
}


