"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ModerationAction } from "@prisma/client";
import { bulkModerateListings, bulkReverifyListings, type BulkModerateResult, type BulkReverifyResult } from "./actions";

export type ListingRow = {
  id: string;
  displayName: string;
  websiteUrl: string;
  websiteDomain: string;
  moderationStatus: string;
  verificationStatus: string;
  latestCrawlStatus: string | null;
  latestCrawlRobotsAllowed: boolean | null;
  lastCrawledAtIso: string | null;
  lastVerifiedAtIso: string | null;
  discoveredAtIso: string | null;
  flags: string[];
};

function uniq(xs: string[]) {
  return Array.from(new Set(xs));
}

function prettyReason(r: string) {
  switch (r) {
    case "not_found":
      return "Not found";
    case "not_draft":
      return "Not DRAFT";
    case "not_pending_review":
      return "Not PENDING_REVIEW";
    case "not_verified":
      return "Not VERIFIED";
    case "needs_attention":
      return "Needs attention";
    case "needs_attention_derived":
      return "Needs attention (derived signals)";
    case "opted_out":
      return "Opted out";
    case "deleted":
      return "Deleted";
    case "no_crawl":
      return "No crawl";
    case "latest_crawl_not_success":
      return "Latest crawl not SUCCESS";
    case "robots_blocked":
      return "Robots blocked";
    case "not_approved":
      return "Not APPROVED";
    case "state_changed":
      return "State changed (race)";
    case "recently_crawled_or_verified":
      return "Already verified / recently crawled";
    case "already_queued_today":
      return "Already queued today";
    case "enqueue_error":
      return "Enqueue error";
    case "missing_redis_url":
      return "Missing REDIS_URL (admin cannot enqueue jobs)";
    case "system_error":
      return "System error";
    default:
      return r;
  }
}

function prettyFlag(f: string) {
  switch (f) {
    case "ai-approved":
      return "Approved by AI";
    case "ai-needs-human-review":
      return "AI needs human review";
    case "needs-attention":
      return "Needs attention";
    case "duplicate-domain":
      return "Duplicate domain";
    case "robots-blocked":
      return "Robots blocked";
    case "stale-verification":
      return "Stale verification";
    case "recent-system-flag":
      return "Recent system flag";
    case "summary-refreshed":
      return "Summary refreshed";
    default:
      return f;
  }
}

function days(n: number) {
  return n * 24 * 60 * 60 * 1000;
}

const REVERIFY_STALE_DAYS = 14;

export default function ListingsTableClient({ rows }: { rows: ListingRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkAction, setBulkAction] = useState<
    "" | "SUBMIT_FOR_REVIEW" | "REVERIFY" | "APPROVE" | "REJECT" | "UNPUBLISH"
  >("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<BulkModerateResult | null>(null);
  const [reverifyResult, setReverifyResult] = useState<BulkReverifyResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const visibleIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const selectedIds = useMemo(() => visibleIds.filter((id) => selected[id]), [visibleIds, selected]);

  const allChecked = selectedIds.length > 0 && selectedIds.length === visibleIds.length;
  const someChecked = selectedIds.length > 0 && selectedIds.length < visibleIds.length;

  const selectedDraftCount = useMemo(() => {
    let n = 0;
    for (const id of selectedIds) {
      const r = rowById.get(id);
      if (r?.moderationStatus === "DRAFT") n++;
    }
    return n;
  }, [selectedIds, rowById]);

  const selectedReverifyEligibleCount = useMemo(() => {
    const cutoff = Date.now() - days(REVERIFY_STALE_DAYS);
    let n = 0;
    for (const id of selectedIds) {
      const r = rowById.get(id);
      if (!r) continue;
      const failed = r.verificationStatus === "FAILED";
      const last = r.lastCrawledAtIso ? Date.parse(r.lastCrawledAtIso) : 0;
      const stale = !r.lastCrawledAtIso || (Number.isFinite(last) && last < cutoff);
      if (failed || stale) n++;
    }
    return n;
  }, [selectedIds, rowById]);

  // If the selection changes such that the chosen action is no longer applicable, reset it.
  useEffect(() => {
    if (bulkAction === "SUBMIT_FOR_REVIEW" && selectedDraftCount === 0) {
      setBulkAction("");
    }
    if (bulkAction === "REVERIFY" && selectedReverifyEligibleCount === 0) {
      setBulkAction("");
    }
  }, [bulkAction, selectedDraftCount, selectedReverifyEligibleCount]);

  // Auto-refresh every 60s to surface newly ingested listings.
  // Pauses while the user is selecting or confirming a bulk action to avoid disrupting workflow.
  useEffect(() => {
    const interval = setInterval(() => {
      if (confirmOpen) return;
      if (isPending) return;
      if (selectedIds.length) return;
      router.refresh();
    }, 60_000);
    return () => clearInterval(interval);
  }, [router, confirmOpen, isPending, selectedIds.length]);

  function toggleAll(next: boolean) {
    const map: Record<string, boolean> = {};
    for (const id of visibleIds) map[id] = next;
    setSelected(map);
  }

  function toggleOne(id: string, next: boolean) {
    setSelected((prev) => ({ ...prev, [id]: next }));
  }

  function resetSelection() {
    setSelected({});
    setBulkAction("");
  }

  async function runConfirmed() {
    const action = bulkAction;
    if (!action) return;
    const ids = selectedIds;

    startTransition(async () => {
      try {
        if (action === "REVERIFY") {
          const res = await bulkReverifyListings(ids);
          setReverifyResult(res);
          setResult(null);
          setConfirmOpen(false);
          if (res.queued > 0) resetSelection();
          router.refresh();
          return;
        }

        const res = await bulkModerateListings(ids, action as ModerationAction);
        setResult(res);
        setReverifyResult(null);
        setConfirmOpen(false);
        // Only clear selection when something actually changed.
        // If everything is skipped, keep selection + action so the user can review/adjust.
        if (res.succeeded > 0) resetSelection();
        router.refresh();
      } catch (e) {
        console.error(e);
        if (action === "REVERIFY") {
          setReverifyResult({
            attempted: ids.length,
            queued: 0,
            skipped: ids.map((listingId) => ({ listingId, reason: "system_error" }))
          });
        } else {
          setResult({
            attempted: ids.length,
            succeeded: 0,
            skipped: ids.map((listingId) => ({ listingId, reason: "system_error" }))
          });
        }
        setConfirmOpen(false);
      }
    });
  }

  const skippedByReason = useMemo(() => {
    if (!result) return [];
    const by: Record<string, number> = {};
    for (const s of result.skipped) by[s.reason] = (by[s.reason] ?? 0) + 1;
    return Object.entries(by)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({ reason, count }));
  }, [result]);

  const ineligibleForApprove = useMemo(() => {
    if (bulkAction !== "APPROVE") return { count: 0, reasons: [] as string[] };
    const reasons = new Set<string>();
    let count = 0;
    for (const id of selectedIds) {
      const r = rowById.get(id);
      if (!r) continue;
      const ok =
        r.moderationStatus === "PENDING_REVIEW" &&
        r.verificationStatus === "VERIFIED" &&
        r.latestCrawlStatus === "SUCCESS" &&
        r.latestCrawlRobotsAllowed !== false;
      if (ok) continue;
      count++;
      if (r.moderationStatus !== "PENDING_REVIEW") reasons.add("listing is not PENDING_REVIEW");
      if (r.verificationStatus !== "VERIFIED") reasons.add(`verificationStatus = ${r.verificationStatus}`);
      if (!r.latestCrawlStatus) reasons.add("no crawl attempts");
      if (r.latestCrawlStatus && r.latestCrawlStatus !== "SUCCESS") reasons.add(`latest crawl status = ${r.latestCrawlStatus}`);
      if (r.latestCrawlRobotsAllowed === false) reasons.add("robotsAllowed = false");
    }
    return { count, reasons: Array.from(reasons) };
  }, [bulkAction, selectedIds, rowById]);

  const ineligibleForSubmitForReview = useMemo(() => {
    if (bulkAction !== "SUBMIT_FOR_REVIEW") return { count: 0 };
    // Eligible: DRAFT only.
    return { count: selectedIds.length - selectedDraftCount };
  }, [bulkAction, selectedIds.length, selectedDraftCount]);

  const ineligibleForReverify = useMemo(() => {
    if (bulkAction !== "REVERIFY") return { count: 0 };
    return { count: selectedIds.length - selectedReverifyEligibleCount };
  }, [bulkAction, selectedIds.length, selectedReverifyEligibleCount]);

  const skippedLines = useMemo(() => {
    if (!result?.skipped?.length) return [];
    return result.skipped.slice(0, 30).map((s) => {
      const r = rowById.get(s.listingId);
      const name = r?.displayName ?? s.listingId;
      // Provide explicit, contextual reasons (Phase 9.9.2).
      let detail = prettyReason(s.reason);
      if (s.reason === "not_draft" && r) detail = `Skipped: listing is not DRAFT (is ${r.moderationStatus})`;
      if (s.reason === "not_pending_review" && r) {
        detail = `Skipped: listing is not PENDING_REVIEW (is ${r.moderationStatus}). Submit for review first.`;
      }
      if (s.reason === "not_verified" && r) {
        detail = `Skipped: verification failed (verificationStatus = ${r.verificationStatus}). Re-verify required.`;
      }
      if (s.reason === "latest_crawl_not_success" && r) {
        detail = `Skipped: crawl failed (latest crawl status = ${r.latestCrawlStatus ?? "unknown"}). Re-verify required.`;
      }
      if (s.reason === "no_crawl") detail = "Skipped: no crawl attempts exist. Re-verify required.";
      if (s.reason === "robots_blocked" && r) detail = "Skipped: robots blocked (robotsAllowed = false).";
      if (s.reason === "system_error") detail = "System error (unexpected).";
      return `${name} — ${detail}`;
    });
  }, [result, rowById]);

  const reverifySkippedLines = useMemo(() => {
    if (!reverifyResult?.skipped?.length) return [];
    return reverifyResult.skipped.slice(0, 30).map((s) => {
      const r = rowById.get(s.listingId);
      const name = r?.displayName ?? s.listingId;
      let detail = prettyReason(s.reason);
      if (s.reason === "recently_crawled_or_verified" && r) {
        detail = `Skipped: already verified or recently crawled (verificationStatus = ${r.verificationStatus})`;
      }
      if (s.reason === "missing_redis_url") {
        detail = "Skipped: admin is missing REDIS_URL (set it in apps/admin/.env.local)";
      }
      if (s.reason === "already_queued_today") detail = "Skipped: already queued today";
      return `${name} — ${detail}`;
    });
  }, [reverifyResult, rowById]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {reverifyResult ? (
        <div
          style={{
            border: "1px solid #ddd",
            background: "#fafafa",
            padding: 10,
            borderRadius: 6,
            fontSize: 13
          }}
        >
          <div style={{ fontWeight: 600 }}>
            {reverifyResult.queued} queued, {reverifyResult.skipped.length} skipped (attempted {reverifyResult.attempted})
          </div>
          {reverifySkippedLines.length ? (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                Skipped items (first {Math.min(30, reverifyResult.skipped.length)}):
              </div>
              <div style={{ display: "grid", gap: 2 }}>
                {reverifySkippedLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {result ? (
        <div
          style={{
            border: "1px solid #ddd",
            background: "#fafafa",
            padding: 10,
            borderRadius: 6,
            fontSize: 13
          }}
        >
          <div style={{ fontWeight: 600 }}>
            {result.succeeded} succeeded, {result.skipped.length} skipped (attempted {result.attempted})
          </div>
          {result.succeeded === 0 ? (
            <div style={{ marginTop: 6, opacity: 0.85 }}>
              No listings were changed. Review the skip reasons below (eligibility is re-checked server-side).
            </div>
          ) : null}
          {skippedByReason.length ? (
            <div style={{ marginTop: 6, display: "grid", gap: 2 }}>
              {skippedByReason.map((x) => (
                <div key={x.reason}>
                  {x.count} × {prettyReason(x.reason)}
                </div>
              ))}
            </div>
          ) : null}
          {skippedLines.length ? (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Skipped items (first {Math.min(30, result.skipped.length)}):</div>
              <div style={{ display: "grid", gap: 2 }}>
                {skippedLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ overflowX: "auto" }}>
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th style={{ width: 34 }}>
                <input
                  type="checkbox"
                  aria-label="Select all (filtered results)"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th>Name</th>
              <th>Domain</th>
              <th>Moderation</th>
              <th>Verification</th>
              <th>Last crawled</th>
              <th>Last verified</th>
              <th>Discovered</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td>
                  <input
                    type="checkbox"
                    checked={Boolean(selected[r.id])}
                    onChange={(e) => toggleOne(r.id, e.target.checked)}
                    aria-label={`Select ${r.displayName}`}
                  />
                </td>
                <td>
                  <a href={`/admin/listings/${r.id}`}>{r.displayName}</a>
                </td>
                <td>
                  <div>{r.websiteDomain}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    <a href={r.websiteUrl} target="_blank" rel="noreferrer">
                      website
                    </a>
                  </div>
                </td>
                <td>{r.moderationStatus}</td>
                <td>{r.verificationStatus}</td>
                <td>{r.lastCrawledAtIso ?? "—"}</td>
                <td>{r.lastVerifiedAtIso ?? "—"}</td>
                <td>{r.discoveredAtIso ?? "—"}</td>
                <td style={{ fontSize: 12 }}>
                  {r.flags.length ? uniq(r.flags).map(prettyFlag).join(", ") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedIds.length ? (
        <div
          style={{
            position: "sticky",
            bottom: 0,
            borderTop: "1px solid #ddd",
            background: "white",
            padding: 10,
            display: "flex",
            alignItems: "center",
            gap: 10
          }}
        >
          <div style={{ fontSize: 13 }}>
            <strong>{selectedIds.length}</strong> selected
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Bulk action
            <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value as any)} disabled={isPending}>
              <option value="">(choose)</option>
              {selectedDraftCount > 0 ? <option value="SUBMIT_FOR_REVIEW">Submit for review</option> : null}
              {selectedReverifyEligibleCount > 0 ? <option value="REVERIFY">Re-verify</option> : null}
              <option value="APPROVE">Approve</option>
              <option value="REJECT">Reject</option>
              <option value="UNPUBLISH">Unpublish</option>
            </select>
          </label>

          <button
            type="button"
            disabled={!bulkAction || isPending}
            onClick={() => {
              setResult(null);
              setConfirmOpen(true);
            }}
          >
            Continue…
          </button>

          <button type="button" disabled={isPending} onClick={() => resetSelection()}>
            Clear
          </button>

          <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.75 }}>
            Auto-refreshes every 60s (paused while selecting). Server re-checks eligibility; unsafe items will be skipped.
          </div>
        </div>
      ) : null}

      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            display: "grid",
            placeItems: "center",
            padding: 20
          }}
        >
          <div style={{ background: "white", borderRadius: 8, padding: 16, width: "min(560px, 100%)" }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {bulkAction === "SUBMIT_FOR_REVIEW"
                ? `Submit ${selectedIds.length} listings for review?`
                : bulkAction === "REVERIFY"
                  ? `Re-verify ${selectedIds.length} listings?`
                : bulkAction === "APPROVE"
                ? `Approve ${selectedIds.length} listings?`
                : bulkAction === "REJECT"
                  ? `Reject ${selectedIds.length} listings?`
                  : `Unpublish ${selectedIds.length} listings?`}
            </div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              {bulkAction === "SUBMIT_FOR_REVIEW"
                ? "This will move them to PENDING_REVIEW and trigger automated evaluation."
                : bulkAction === "REVERIFY"
                  ? "This will re-crawl their websites and re-run verification checks."
                : "This action is permanent but reversible via moderation. One audit event will be written per listing."}
            </div>
            {bulkAction === "APPROVE" && ineligibleForApprove.count > 0 ? (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <strong>Heads up:</strong> {ineligibleForApprove.count} selected listing(s) are not eligible for approval.
                They must be submitted for review and pass verification.{" "}
                {ineligibleForApprove.reasons.length ? `(${ineligibleForApprove.reasons.join("; ")})` : ""}
              </div>
            ) : null}
            {bulkAction === "SUBMIT_FOR_REVIEW" && ineligibleForSubmitForReview.count > 0 ? (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <strong>Heads up:</strong> {ineligibleForSubmitForReview.count} selected listing(s) are not in DRAFT and will be
                skipped.
              </div>
            ) : null}
            {bulkAction === "REVERIFY" && ineligibleForReverify.count > 0 ? (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <strong>Heads up:</strong> {ineligibleForReverify.count} selected listing(s) are already verified and recently
                crawled, and will be skipped.
              </div>
            ) : null}

            <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={isPending}>
                Cancel
              </button>
              <button type="button" onClick={runConfirmed} disabled={isPending}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


