import { prisma } from "../../../src/lib/prisma";
import { acceptRemovalRequestAction, rejectRemovalRequestAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function RemovalRequestsQueuePage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const noticeRaw = searchParams?.notice;
  const notice = Array.isArray(noticeRaw) ? noticeRaw[0] : noticeRaw;
  const noticeText =
    notice === "accepted"
      ? "Removal request accepted. Listing opted out."
      : notice === "rejected"
        ? "Removal request rejected."
        : notice === "error"
          ? "Action failed. Check server logs for the error."
          : null;

  const requests = await prisma.listingRemovalRequest.findMany({
    where: { status: "PENDING" },
    orderBy: [{ createdAt: "asc" }],
    include: {
      listing: {
        select: {
          id: true,
          displayName: true,
          websiteDomain: true,
          moderationStatus: true
        }
      }
    },
    take: 200
  });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {noticeText ? (
        <div style={{ padding: 10, border: "1px solid #ddd", background: "#fafafa" }}>
          {noticeText}
        </div>
      ) : null}
      <h2 style={{ margin: 0 }}>Removal requests (PENDING)</h2>
      <div style={{ fontSize: 12, opacity: 0.8 }}>Showing up to 200 pending requests.</div>

      {requests.length ? (
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Created</th>
              <th>Listing</th>
              <th>Channel</th>
              <th>Relationship</th>
              <th>Requester</th>
              <th>Note</th>
              <th>Decisions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td>{r.createdAt.toISOString()}</td>
                <td>
                  <div>
                    <a href={`/admin/listings/${r.listing.id}`}>{r.listing.displayName}</a>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {r.listing.websiteDomain} ({r.listing.moderationStatus})
                  </div>
                </td>
                <td>{r.channel}</td>
                <td>{r.requesterRelationship}</td>
                <td style={{ fontSize: 12 }}>
                  {r.requesterName ?? "—"}
                  <br />
                  {r.requesterEmail ?? "—"}
                  <br />
                  {r.requesterPhone ?? "—"}
                </td>
                <td style={{ fontSize: 12 }}>{r.note ?? "—"}</td>
                <td style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <form action={acceptRemovalRequestAction} style={{ display: "grid", gap: 4 }}>
                    <input type="hidden" name="removalRequestId" value={r.id} />
                    <input name="note" placeholder="Decision note (optional)" />
                    <button type="submit">Accept → opt-out</button>
                  </form>
                  <form action={rejectRemovalRequestAction} style={{ display: "grid", gap: 4 }}>
                    <input type="hidden" name="removalRequestId" value={r.id} />
                    <input name="note" placeholder="Decision note (optional)" />
                    <button type="submit">Reject</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div>No pending removal requests.</div>
      )}
    </div>
  );
}


