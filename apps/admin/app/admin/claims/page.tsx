import { prisma } from "../../../src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClaimsQueuePage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const statusRaw = searchParams?.status;
  const status = (Array.isArray(statusRaw) ? statusRaw[0] : statusRaw) || "PENDING";
  const normalized = status === "ACCEPTED" || status === "REJECTED" || status === "PENDING" ? status : "PENDING";

  const requests = await prisma.listingClaimRequest.findMany({
    where: { status: normalized as any },
    orderBy: [{ createdAt: "asc" }],
    include: {
      listing: { select: { id: true, displayName: true, websiteDomain: true, moderationStatus: true } }
    },
    take: 200
  });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Claim & correction requests</h2>

      <form method="get" action="/admin/claims" style={{ display: "flex", gap: 8 }}>
        <label>
          Status{" "}
          <select name="status" defaultValue={normalized}>
            <option value="PENDING">PENDING</option>
            <option value="ACCEPTED">ACCEPTED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>

      <div style={{ fontSize: 12, opacity: 0.8 }}>Showing up to 200 requests.</div>

      {requests.length ? (
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Submitted</th>
              <th>Type</th>
              <th>Listing</th>
              <th>Requester</th>
              <th>Relationship</th>
              <th>Requested fields</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td>{r.createdAt.toISOString()}</td>
                <td>{r.requestType}</td>
                <td>
                  <div>
                    <a href={`/admin/claims/${r.id}`}>{r.listing.displayName}</a>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {r.listing.websiteDomain} ({r.listing.moderationStatus})
                  </div>
                </td>
                <td style={{ fontSize: 12 }}>
                  {r.requesterName}
                  <br />
                  {r.requesterEmail}
                </td>
                <td>{r.relationship}</td>
                <td style={{ fontSize: 12 }}>{JSON.stringify((r.fieldsRequested as any)?.fields ?? [])}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div>No requests.</div>
      )}
    </div>
  );
}


