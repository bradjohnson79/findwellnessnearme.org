import type { Cuid } from "./lib/ids.js";

export type DiscoverCandidate = {
  // Best-effort; may be empty.
  displayName?: string;
  websiteUrl: string;
  // Optional hints (do not trust; admin + verification must confirm).
  city?: string;
  state?: string; // e.g. "CA"
};

export type DiscoverJobData = {
  // Discovery via search queries (can be stubbed). Provide either:
  // - queryText: for an actual search integration (not implemented in MVP)
  // - candidates: list of Tier-1 website URLs (recommended for MVP/testing)
  queryText?: string;
  candidates?: DiscoverCandidate[];
};

export type CrawlJobData = {
  listingId: Cuid;
};

export type ExtractJobData = {
  listingId: Cuid;
  crawlAttemptId: Cuid;
};

export type AiEvaluateJobData = {
  listingId: Cuid;
  crawlAttemptId: Cuid;
};

export type DiscoverCityBatchJobData = {
  stateSlug: string;
  citySlugs: string[];
  modalitySlugs: string[];
};

export type DiscoveryStateWaveJobData = {
  // Config-driven; payload intentionally empty for repeatable scheduling.
};


