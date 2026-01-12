import { notFound } from "next/navigation";
import { prisma } from "../../../../src/lib/prisma";
import { acceptClaimRequestAction, rejectClaimRequestAction } from "./actions";

export const dynamic = "force-dynamic";

const APPLY_FIELDS = [
  { key: "displayName", label: "Name" },
  { key: "websiteUrl", label: "Website URL" },
  { key: "modalities", label: "Modalities" },
  { key: "location", label: "Location (add)" }
] as const;

export default async function ClaimDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const noticeRaw = searchParams?.notice;
  const notice = Array.isArray(noticeRaw) ? noticeRaw[0] : noticeRaw;
  const noticeText =
    notice === "accepted"
      ? "Request accepted."
      : notice === "rejected"
        ? "Request rejected."
        : notice === "error"
          ? "Action failed. Check server logs."
          : null;

  const req = await prisma.listingClaimRequest.findUnique({
    where: { id: params.id },
    include: {
      listing: {
        include: {
          modalities: { include: { modality: true } },
          locations: { where: { deletedAt: null }, include: { city: { include: { state: true } } } }
        }
      }
    }
  });
  if (!req) return notFound();

  const payload = req.fieldsRequested as any;

  const current = {
    displayName: req.listing.displayName,
    websiteUrl: req.listing.websiteUrl,
    modalities: req.listing.modalities.map((m) => m.modality.displayName).sort(),
    locations: req.listing.locations.map((l) => `${l.city.name}, ${l.city.state.uspsCode}`)
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {noticeText ? (
        <div style={{ padding: 10, border: "1px solid #ddd", background: "#fafafa" }}>{noticeText}</div>
      ) : null}

      <h2 style={{ margin: 0 }}>Claim / correction review</h2>

      <div style={{ fontSize: 12, opacity: 0.8 }}>
        Request: {req.requestType} · status: {req.status} · submitted: {req.createdAt.toISOString()}
      </div>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Requester</h3>
        <div>
          {req.requesterName} · {req.requesterEmail} · {req.relationship}
        </div>
        {req.note ? <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{req.note}</div> : null}
      </section>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Listing (current)</h3>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          <a href={`/admin/listings/${req.listingId}`}>Open listing in admin</a>
        </div>
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Field</th>
              <th>Current</th>
              <th>Requested</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td>Name</td>
              <td>{current.displayName}</td>
              <td>{payload.displayName ?? "—"}</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td>Website</td>
              <td style={{ fontSize: 12 }}>{current.websiteUrl}</td>
              <td style={{ fontSize: 12 }}>{payload.websiteUrl ?? "—"}</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td>Modalities</td>
              <td style={{ fontSize: 12 }}>{current.modalities.join(", ") || "—"}</td>
              <td style={{ fontSize: 12 }}>{JSON.stringify(payload.modalitySlugs ?? [])}</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td>Location</td>
              <td style={{ fontSize: 12 }}>{current.locations.join(" · ") || "—"}</td>
              <td style={{ fontSize: 12 }}>{JSON.stringify(payload.location ?? {})}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {req.status === "PENDING" ? (
        <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
          <h3 style={{ margin: "0 0 8px 0" }}>Decision</h3>

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <form action={acceptClaimRequestAction} style={{ display: "grid", gap: 8, minWidth: 320 }}>
              <input type="hidden" name="claimRequestId" value={req.id} />
              <div style={{ fontSize: 12, opacity: 0.8 }}>Apply fields (partial acceptance supported)</div>
              <div>
                {APPLY_FIELDS.map((f) => (
                  <label key={f.key} style={{ display: "block" }}>
                    <input type="checkbox" name="applyFields" value={f.key} /> {f.label}
                  </label>
                ))}
              </div>
              <label>
                Decision note
                <br />
                <input name="note" style={{ width: "100%" }} />
              </label>
              <button type="submit">Accept (apply selected)</button>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                This will update listing fields (factual only), keep listing visibility unchanged, and write one SUBMIT_FOR_REVIEW event.
              </div>
            </form>

            <form action={rejectClaimRequestAction} style={{ display: "grid", gap: 8, minWidth: 320 }}>
              <input type="hidden" name="claimRequestId" value={req.id} />
              <label>
                Rejection note
                <br />
                <input name="note" style={{ width: "100%" }} />
              </label>
              <button type="submit">Reject</button>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                This will not change the listing, and writes one REJECT moderation event.
              </div>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );
}


