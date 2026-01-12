import { ModerationReasonCode } from "@prisma/client";
import { prisma } from "../../../../src/lib/prisma";
import {
  addLocationAction,
  approveAction,
  editPublicFieldsAction,
  optOutAction,
  rejectAction,
  reverifyAction,
  removeLocationAction,
  setModalitiesAction,
  setPrimaryLocationAction,
  softDeleteAction,
  submitForReviewAction,
  unpublishAction
} from "./actions";

export const dynamic = "force-dynamic";

const REJECT_REASONS: ModerationReasonCode[] = [
  "DUPLICATE",
  "NOT_TIER1",
  "NO_WEBSITE",
  "OUTSIDE_US",
  "NOT_PRACTITIONER_OR_BUSINESS",
  "REQUESTED_REMOVAL",
  "OTHER"
];

export default async function ListingDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { id } = params;
  const noticeRaw = searchParams?.notice;
  const notice = Array.isArray(noticeRaw) ? noticeRaw[0] : noticeRaw;
  const detailRaw = searchParams?.detail;
  const detail = Array.isArray(detailRaw) ? detailRaw[0] : detailRaw;

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      modalities: { include: { modality: true } },
      locations: {
        where: { deletedAt: null },
        include: { city: { include: { state: { include: { country: true } } } } },
        orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }]
      },
      discoveryEvents: { orderBy: [{ discoveredAt: "asc" }] },
      crawlAttempts: { orderBy: [{ startedAt: "desc" }], take: 50 },
      aiReviews: { orderBy: [{ reviewedAt: "desc" }], take: 10 },
      moderationEvents: { orderBy: [{ createdAt: "desc" }], take: 50 },
      removalRequests: { orderBy: [{ createdAt: "desc" }], take: 20 }
    }
  });

  if (!listing) return <div>Listing not found.</div>;

  const allModalities = await prisma.modality.findMany({
    where: { isActive: true },
    orderBy: [{ displayName: "asc" }]
  });

  const hasPendingRemovalRequest = listing.removalRequests.some((r) => r.status === "PENDING");

  const latestCrawl = listing.crawlAttempts[0] ?? null;
  const approvalNotesRaw: Array<string | null> = [
    listing.moderationStatus !== "PENDING_REVIEW"
      ? `Skipped: listing is not PENDING_REVIEW (is ${listing.moderationStatus})`
      : null,
    latestCrawl ? null : "No crawl attempts exist",
    latestCrawl && latestCrawl.status !== "SUCCESS"
      ? `Skipped: latest crawl status = ${latestCrawl.status}`
      : null,
    latestCrawl?.robotsAllowed === false ? "Skipped: robotsAllowed = false" : null,
    listing.verificationStatus !== "VERIFIED"
      ? `Skipped: verificationStatus = ${listing.verificationStatus}`
      : null
  ];
  const approvalNotes = approvalNotesRaw.filter((x): x is string => Boolean(x));
  const approvalPrecheck = {
    ok:
      !!latestCrawl &&
      listing.moderationStatus === "PENDING_REVIEW" &&
      latestCrawl.status === "SUCCESS" &&
      latestCrawl.robotsAllowed !== false &&
      listing.verificationStatus === "VERIFIED",
    notes: approvalNotes
  };

  const noticeText =
    notice === "approved"
      ? "Approved."
      : notice === "rejected"
        ? "Rejected."
        : notice === "unpublished"
          ? "Unpublished."
          : notice === "soft_deleted"
            ? "Soft-deleted."
            : notice === "opted_out"
              ? "Opted out (removal request accepted)."
              : notice === "saved"
                ? "Saved. (Re-review event recorded.)"
                : notice === "modalities_saved"
                  ? "Modalities saved. (Re-review event recorded.)"
                  : notice === "location_added"
                    ? "Location added. (Re-review event recorded.)"
                    : notice === "primary_location_set"
                      ? "Primary location updated. (Re-review event recorded.)"
                      : notice === "location_removed"
                        ? "Location removed. (Re-review event recorded.)"
                        : notice === "submitted_for_review"
                          ? "Submitted for review."
                          : notice === "approval_blocked"
                            ? "Approval blocked. See details below."
                          : notice === "reverify_queued"
                            ? "Re-verify queued."
                          : notice === "reverify_skipped"
                            ? "Re-verify skipped."
                          : notice === "error"
                            ? "Action failed. Check server logs for the error."
                            : null;

  const reverifyCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const reverifyEligible =
    listing.verificationStatus === "FAILED" || !listing.lastCrawledAt || listing.lastCrawledAt < reverifyCutoff;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {noticeText ? (
        <div style={{ padding: 10, border: "1px solid #ddd", background: "#fafafa" }}>
          {noticeText}
          {notice === "approval_blocked" && detail ? (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>{detail}</div>
          ) : null}
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Listing</div>
          <h2 style={{ margin: 0 }}>{listing.displayName}</h2>
          <div style={{ fontSize: 12 }}>
            <a href={listing.websiteUrl} target="_blank" rel="noreferrer">
              {listing.websiteDomain}
            </a>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Moderation</div>
            <div>{listing.moderationStatus}</div>
            {(listing as any).approvalSource === "AI" ? (
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>
                <strong>Approved by AI</strong>
                {(listing as any).approvalConfidence != null ? (
                  <span> (confidence {(listing as any).approvalConfidence.toFixed(2)})</span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Verification</div>
            <div>{listing.verificationStatus}</div>
          </div>
        </div>
      </div>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Public fields (editable)</h3>
        <form action={editPublicFieldsAction} style={{ display: "grid", gap: 8, maxWidth: 900 }}>
          <input type="hidden" name="listingId" value={listing.id} />
          <label>
            Display name
            <br />
            <input
              name="displayName"
              defaultValue={listing.displayName}
              style={{ width: "100%" }}
            />
          </label>
          <label>
            Summary (neutral, paraphrased)
            <br />
            <textarea
              name="summary"
              defaultValue={listing.summary ?? ""}
              rows={5}
              style={{ width: "100%" }}
            />
          </label>
          <div>
            <button type="submit">Save edits (forces re-review)</button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Rule: any edit forces APPROVED → PENDING_REVIEW and writes one SUBMIT_FOR_REVIEW event.
          </div>
        </form>
      </section>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Modalities (editable)</h3>
        <form action={setModalitiesAction} style={{ display: "grid", gap: 8, maxWidth: 900 }}>
          <input type="hidden" name="listingId" value={listing.id} />
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Uses controlled taxonomy (`Modality`). If empty, seed modalities before using this UI.
          </div>
          <select
            name="modalityIds"
            multiple
            size={Math.min(12, Math.max(4, allModalities.length))}
            defaultValue={listing.modalities.map((lm) => lm.modalityId)}
            style={{ width: "100%" }}
          >
            {allModalities.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName} ({m.slug})
              </option>
            ))}
          </select>
          <div>
            <button type="submit">Save modalities (forces re-review)</button>
          </div>
        </form>
      </section>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Locations (editable)</h3>
        <div style={{ display: "grid", gap: 10 }}>
          {listing.locations.length ? (
            <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                  <th>Primary</th>
                  <th>City</th>
                  <th>State</th>
                  <th>Country</th>
                  <th>Street</th>
                  <th>Postal</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {listing.locations.map((loc) => (
                  <tr key={loc.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td>{loc.isPrimary ? "yes" : "no"}</td>
                    <td>{loc.city.name}</td>
                    <td>{loc.city.state.uspsCode}</td>
                    <td>{loc.city.state.country.iso2}</td>
                    <td>
                      {[loc.street1, loc.street2].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td>{loc.postalCode ?? "—"}</td>
                    <td style={{ display: "flex", gap: 8 }}>
                      <form action={setPrimaryLocationAction}>
                        <input type="hidden" name="listingId" value={listing.id} />
                        <input type="hidden" name="locationId" value={loc.id} />
                        <button type="submit" disabled={loc.isPrimary}>
                          Set primary
                        </button>
                      </form>
                      <form action={removeLocationAction}>
                        <input type="hidden" name="listingId" value={listing.id} />
                        <input type="hidden" name="locationId" value={loc.id} />
                        <button type="submit">Remove</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.8 }}>No active locations.</div>
          )}

          <details>
            <summary>Add location</summary>
            <form
              action={addLocationAction}
              style={{ display: "grid", gap: 8, maxWidth: 900, marginTop: 8 }}
            >
              <input type="hidden" name="listingId" value={listing.id} />
              <label>
                City ID (required)
                <br />
                <input name="cityId" placeholder="cuid()" style={{ width: "100%" }} />
              </label>
              <label>
                Street 1
                <br />
                <input name="street1" style={{ width: "100%" }} />
              </label>
              <label>
                Street 2
                <br />
                <input name="street2" style={{ width: "100%" }} />
              </label>
              <label>
                Postal code
                <br />
                <input name="postalCode" style={{ width: "100%" }} />
              </label>
              <label>
                <input type="checkbox" name="isPrimary" /> Set as primary
              </label>
              <div>
                <button type="submit">Add location (forces re-review)</button>
              </div>
            </form>
          </details>
        </div>
      </section>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Actions</h3>

        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <form action={submitForReviewAction}>
              <input type="hidden" name="listingId" value={listing.id} />
              <button type="submit" style={{ fontWeight: listing.moderationStatus === "DRAFT" ? 700 : undefined }}>
                Submit for review
              </button>
            </form>

            {reverifyEligible ? (
              <form action={reverifyAction}>
                <input type="hidden" name="listingId" value={listing.id} />
                <button type="submit">Re-run verification</button>
              </form>
            ) : null}

            <form action={approveAction}>
              <input type="hidden" name="listingId" value={listing.id} />
              <button type="submit" disabled={!approvalPrecheck.ok}>
                Approve
              </button>
            </form>

            <form action={unpublishAction}>
              <input type="hidden" name="listingId" value={listing.id} />
              <input type="hidden" name="note" value="Unpublished by admin" />
              <button type="submit">Unpublish</button>
            </form>

            <form action={softDeleteAction}>
              <input type="hidden" name="listingId" value={listing.id} />
              <button type="submit">Soft delete</button>
            </form>

            <form action={optOutAction}>
              <input type="hidden" name="listingId" value={listing.id} />
              <button type="submit" disabled={!hasPendingRemovalRequest}>
                Opt-out (requires removal request)
              </button>
            </form>
          </div>

          {!approvalPrecheck.ok ? (
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Approval blocked until all checks pass.</div>
              {listing.moderationStatus !== "PENDING_REVIEW" ? (
                <div style={{ marginBottom: 6 }}>
                  Listings must be submitted for review and pass verification before approval.
                </div>
              ) : null}
              {reverifyEligible ? (
                <div style={{ marginBottom: 6 }}>
                  Re-run verification re-crawls the site and re-evaluates verification. Required before approval.
                </div>
              ) : null}
              <ul>
                {approvalPrecheck.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <details>
            <summary>Reject (requires reason)</summary>
            <form action={rejectAction} style={{ display: "grid", gap: 8, maxWidth: 700 }}>
              <input type="hidden" name="listingId" value={listing.id} />
              <label>
                Reason code
                <br />
                <select name="reasonCode" defaultValue="OTHER">
                  {REJECT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Note
                <br />
                <textarea name="note" rows={3} style={{ width: "100%" }} />
              </label>
              <div>
                <button type="submit">Reject</button>
              </div>
            </form>
          </details>
        </div>
      </section>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>AI review</h3>
        {listing.aiReviews.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {listing.aiReviews.map((r) => (
              <div key={r.id} style={{ border: "1px solid #eee", padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {r.verdict} · confidence {r.confidence.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      model {r.modelVersion} · {r.reviewedAt.toISOString()}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12, opacity: 0.85 }}>
                    {listing.aiNeedsHumanReview ? "Needs human review" : "No human flag"}
                  </div>
                </div>
                {r.flags.length ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>Flags</div>
                    <div style={{ fontSize: 12 }}>{r.flags.join(", ")}</div>
                  </div>
                ) : null}
                {r.reasons.length ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>Reasons</div>
                    <ul style={{ margin: "6px 0 0 18px" }}>
                      {r.reasons.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            No AI reviews yet. (Phase 10 runs AI evaluation only after successful verification + extract.)
          </div>
        )}
      </section>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Provenance</h3>
        {listing.discoveryEvents.length ? (
          <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>Discovered</th>
                <th>Source type</th>
                <th>Source URL</th>
                <th>Query</th>
              </tr>
            </thead>
            <tbody>
              {listing.discoveryEvents.map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td>{e.discoveredAt.toISOString()}</td>
                  <td>{e.sourceType}</td>
                  <td>{e.sourceUrl ?? "—"}</td>
                  <td>{e.queryText ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.8 }}>No discovery events.</div>
        )}
      </section>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Crawl history</h3>
        {listing.crawlAttempts.length ? (
          <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>Started</th>
                <th>Status</th>
                <th>HTTP</th>
                <th>Robots allowed</th>
                <th>Purpose</th>
                <th>Target URL</th>
              </tr>
            </thead>
            <tbody>
              {listing.crawlAttempts.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td>{c.startedAt.toISOString()}</td>
                  <td>{c.status}</td>
                  <td>{c.httpStatus ?? "—"}</td>
                  <td>{c.robotsAllowed === null ? "—" : String(c.robotsAllowed)}</td>
                  <td>{c.purpose}</td>
                  <td style={{ fontSize: 12 }}>{c.targetUrl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.8 }}>No crawl attempts.</div>
        )}
      </section>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Moderation history</h3>
        {listing.moderationEvents.length ? (
          <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>At</th>
                <th>Action</th>
                <th>Reason</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {listing.moderationEvents.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td>{m.createdAt.toISOString()}</td>
                  <td>{m.action}</td>
                  <td>{m.reasonCode ?? "—"}</td>
                  <td style={{ fontSize: 12 }}>{m.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.8 }}>No moderation events.</div>
        )}
      </section>

      <section style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Removal requests</h3>
        {listing.removalRequests.length ? (
          <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>At</th>
                <th>Status</th>
                <th>Channel</th>
                <th>Relationship</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {listing.removalRequests.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td>{r.createdAt.toISOString()}</td>
                  <td>{r.status}</td>
                  <td>{r.channel}</td>
                  <td>{r.requesterRelationship}</td>
                  <td style={{ fontSize: 12 }}>{r.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.8 }}>No removal requests.</div>
        )}
      </section>
    </div>
  );
}


