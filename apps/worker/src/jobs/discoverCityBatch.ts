import { prisma } from "../lib/prisma.js";
import { discoveryConfig } from "../lib/discoveryConfig.js";
import { webSearch, type SearchProvider } from "../lib/search/index.js";
import { BraveSearchError } from "../lib/search/brave.js";
import { getRegistrableHost, normalizeWebsiteUrl } from "../lib/url.js";
import type { DiscoverCityBatchJobData, DiscoverCandidate } from "../types.js";
import { runDiscoverJob } from "./discover.js";
import type { Queue } from "bullmq";
import { logSystemTaskRun } from "../lib/systemTaskRunLog.js";
import { SYSTEM_TASKS } from "../systemTasks.js";
import { DISCOVERY_BLOCKED_DOMAINS, isBlockedHostname } from "../lib/discoveryBlocklist.js";
import { appendDiscoveryAttempt } from "../lib/discoveryLedger.js";
import type { DiscoveryDecision, ProviderErrorType } from "@prisma/client";

function startOfTodayUtc() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}

function stableHash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function providerFromEnv(cfg: ReturnType<typeof discoveryConfig>): SearchProvider {
  if (cfg.searchProvider === "brave" && cfg.braveApiKey) return { kind: "brave", apiKey: cfg.braveApiKey };
  return { kind: "none" };
}

function buildQuery(args: {
  label: string;
  cityName: string;
  stateUsps: string;
  provider: SearchProvider;
}) {
  // Deterministic, conservative refinement:
  // - include intent qualifiers (about/contact/clinic/practice)
  // - include "site" to bias toward first-party websites
  // - apply negative-site filters when provider supports it (Brave accepts -site:)
  const base = `${args.label} ${args.cityName} ${args.stateUsps} clinic practice about contact site`;
  if (args.provider.kind !== "brave") return base;
  const negatives = DISCOVERY_BLOCKED_DOMAINS.map((d) => `-site:${d}`).join(" ");
  return `${base} ${negatives}`.trim();
}

function termLabelFromSlug(slug: string) {
  // Treat unknown slugs as safe, low-stakes query terms (does NOT create Modality rows).
  return slug
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function providerEnum(provider: SearchProvider) {
  if (provider.kind === "brave") return "BRAVE" as const;
  return "MANUAL" as const;
}

function providerPriority(provider: SearchProvider): number {
  // Deterministic priority ordering (higher wins).
  // For now we only have Brave + (none). Keep explicit for future expansion.
  if (provider.kind === "brave") return 100;
  return 0;
}

function errorTypeFromBrave(e: BraveSearchError): ProviderErrorType {
  // Map Brave-specific error types into our Phase 8 enum.
  switch (e.errorType) {
    case "timeout":
      return "timeout";
    case "quota":
      return "quota";
    case "parse":
      return "parse";
    case "malformed":
      return "malformed";
    case "empty":
      return "empty";
    default:
      return "other";
  }
}

async function logProviderCall(args: {
  jobId: string;
  jobType: "DISCOVER_CITY_BATCH";
  provider: ReturnType<typeof providerEnum>;
  query: any;
  status: "ok" | "empty" | "error";
  resultCount: number;
  invalidUrlCount?: number;
  blockedDomainCount?: number;
  uniqueDomainCount?: number;
  errorType?: ProviderErrorType | null;
  errorCode?: string | null;
  retryable?: boolean | null;
  payloadExcerpt?: string | null;
}) {
  await prisma.discoveryProviderCall.create({
    data: {
      jobId: args.jobId,
      jobType: args.jobType,
      provider: args.provider,
      query: args.query,
      status: args.status,
      resultCount: args.resultCount,
      invalidUrlCount: args.invalidUrlCount ?? 0,
      blockedDomainCount: args.blockedDomainCount ?? 0,
      uniqueDomainCount: args.uniqueDomainCount ?? 0,
      errorType: args.errorType ?? null,
      errorCode: args.errorCode ?? null,
      retryable: args.retryable ?? null,
      payloadExcerpt: args.payloadExcerpt ?? null
    }
  });
}

export async function runDiscoverCityBatchJob(
  data: DiscoverCityBatchJobData,
  deps: { queue: Queue; jobId: string }
): Promise<{ created: number; deduped: number; candidates: number }> {
  const cfg = discoveryConfig();
  const started = Date.now();
  const cronExpr = SYSTEM_TASKS.DISCOVERY_STATE_WAVE.cronExpr;

  const state = await prisma.state.findFirst({
    where: { slug: data.stateSlug, country: { iso2: "US" } },
    select: { id: true, slug: true, uspsCode: true, name: true }
  });
  if (!state) {
    await logSystemTaskRun({
      taskName: "DISCOVER_CITY_BATCH",
      taskType: "CRAWL",
      scopeType: "STATE",
      scopeTarget: data.stateSlug,
      cronExpr,
      lastStatus: "SKIPPED",
      durationMs: Date.now() - started,
      note: "Unknown state"
    });
    return { created: 0, deduped: 0, candidates: 0 };
  }

  if (!data.citySlugs?.length || !data.modalitySlugs?.length) {
    await logSystemTaskRun({
      taskName: "DISCOVER_CITY_BATCH",
      taskType: "CRAWL",
      scopeType: "STATE",
      scopeTarget: state.slug,
      cronExpr,
      lastStatus: "SKIPPED",
      durationMs: Date.now() - started,
      note: "Empty city/modality set"
    });
    return { created: 0, deduped: 0, candidates: 0 };
  }

  // Hard daily cap: count new draft listings created today (best-effort).
  const createdToday = await prisma.listing.count({
    where: { createdAt: { gte: startOfTodayUtc() }, moderationStatus: "DRAFT" }
  });
  if (createdToday >= cfg.maxNewListingsPerDay) {
    await logSystemTaskRun({
      taskName: "DISCOVER_CITY_BATCH",
      taskType: "CRAWL",
      scopeType: "STATE",
      scopeTarget: state.slug,
      cronExpr,
      lastStatus: "SKIPPED",
      durationMs: Date.now() - started,
      note: `Daily cap reached: ${createdToday}/${cfg.maxNewListingsPerDay}`
    });
    return { created: 0, deduped: 0, candidates: 0 };
  }

  const cities = await prisma.city.findMany({
    where: { slug: { in: data.citySlugs }, stateId: state.id },
    select: { slug: true, name: true }
  });
  const cityBySlug = new Map(cities.map((c) => [c.slug, c]));

  const modalities = await prisma.modality.findMany({
    where: { slug: { in: data.modalitySlugs }, isActive: true },
    select: { slug: true, displayName: true }
  });
  const modBySlug = new Map(modalities.map((m) => [m.slug, m]));

  const provider = providerFromEnv(cfg);
  if (provider.kind === "none") {
    await logSystemTaskRun({
      taskName: "DISCOVER_CITY_BATCH",
      taskType: "CRAWL",
      scopeType: "STATE",
      scopeTarget: state.slug,
      cronExpr,
      lastStatus: "SKIPPED",
      durationMs: Date.now() - started,
      note: "Discovery disabled (DISCOVERY_SEARCH_PROVIDER=none or missing API key)"
    });
    await logProviderCall({
      jobId: deps.jobId,
      jobType: "DISCOVER_CITY_BATCH",
      provider: "MANUAL",
      query: {
        stateSlug: data.stateSlug,
        citySlugs: data.citySlugs ?? [],
        categories: data.modalitySlugs ?? [],
        text: null
      },
      status: "error",
      resultCount: 0,
      errorType: "other",
      errorCode: "PROVIDER_DISABLED",
      retryable: false,
      payloadExcerpt: "DISCOVERY_SEARCH_PROVIDER=none or missing API key"
    });
    return { created: 0, deduped: 0, candidates: 0 };
  }

  let totalCreated = 0;
  let totalDeduped = 0;
  let totalCandidates = 0;
  let totalBlocked = 0;
  let totalInvalidUrls = 0;
  let totalExistingDomains = 0;
  const sampleQueries: string[] = [];
  let totalAttempts = 0;
  let providerCalls = { ok: 0, empty: 0, error: 0 };
  const providerPrio = providerPriority(provider);

  // One job per city batch; within, keep it slow and bounded.
  for (const citySlug of data.citySlugs) {
    const city = cityBySlug.get(citySlug);
    if (!city) continue;

    const resultRows: Array<{
      url: string;
      domain: string | null;
      termSlug: string;
      queryText: string;
    }> = [];

    for (const termSlug of data.modalitySlugs) {
      // Prefer canonical modality displayName if present; otherwise treat as query term.
      const label = modBySlug.get(termSlug)?.displayName ?? termLabelFromSlug(termSlug);
      if (!label) continue;
      const queryText = buildQuery({ label, cityName: city.name, stateUsps: state.uspsCode, provider });
      if (sampleQueries.length < 6) sampleQueries.push(queryText);

      try {
        const results = await webSearch(provider, { query: queryText, count: cfg.maxResultsPerQuery });
        if (!results.length) {
          providerCalls.empty++;
          await logProviderCall({
            jobId: deps.jobId,
            jobType: "DISCOVER_CITY_BATCH",
            provider: providerEnum(provider),
            query: { stateSlug: state.slug, citySlug: city.slug, category: termSlug, text: queryText },
            status: "empty",
            resultCount: 0
          });
          continue;
        }
        providerCalls.ok++;

        for (const r of results) {
          const url = r.url;
          let domain: string | null = null;
          try {
            const nu = normalizeWebsiteUrl(url);
            domain = getRegistrableHost(nu);
          } catch {
            domain = null;
          }
          resultRows.push({ url, domain, termSlug, queryText });
        }

        // We'll fill in invalid/blocked/unique counts for this call after we scan rows below.
      } catch (e: any) {
        // Phase 8: provider errors must be ledgered (never silent).
        const err = e instanceof BraveSearchError ? e : null;
        const code = err ? String(err.status) : "unknown";
        const errorType: ProviderErrorType = err ? errorTypeFromBrave(err) : "other";
        const retryable = err ? err.retryable : true;

        providerCalls.error++;
        await logProviderCall({
          jobId: deps.jobId,
          jobType: "DISCOVER_CITY_BATCH",
          provider: providerEnum(provider),
          query: { stateSlug: state.slug, citySlug: city.slug, category: termSlug, text: queryText },
          status: "error",
          resultCount: 0,
          errorType,
          errorCode: code,
          retryable,
          payloadExcerpt: err?.payloadExcerpt ?? null
        });
        continue;
      }
    }

    if (!resultRows.length) continue;

    // Evaluate DB duplicates once per city for efficiency.
    const uniqueDomains = Array.from(new Set(resultRows.map((a) => a.domain).filter(Boolean) as string[]));
    const existing = uniqueDomains.length
      ? await prisma.listing.findMany({
          where: { websiteDomain: { in: uniqueDomains } },
          select: { websiteDomain: true }
        })
      : [];
    const existingSet = new Set(existing.map((e) => e.websiteDomain));

    // Candidate building: 1 candidate per unique domain.
    // Confidence heuristic (deterministic, bounded):
    // - base: 0.5
    // - boost if URL path is "/" or short
    // - boost if query includes "clinic/practice"
    // This is intentionally simple and explainable.
    const bestUrlByDomain = new Map<string, string>();
    const bestScoreByDomain = new Map<string, number>();
    let invalidUrlCount = 0;
    let blockedDomainCount = 0;

    for (const r of resultRows) {
      if (!r.domain) {
        invalidUrlCount++;
        continue;
      }
      if (isBlockedHostname(r.domain)) {
        blockedDomainCount++;
        continue;
      }
      if (!bestUrlByDomain.has(r.domain)) {
        bestUrlByDomain.set(r.domain, r.url);
        bestScoreByDomain.set(r.domain, 0.5);
      }
      // Score URL shape deterministically.
      try {
        const u = new URL(r.url);
        const path = u.pathname || "/";
        let score = bestScoreByDomain.get(r.domain) ?? 0.5;
        if (path === "/" || path.length <= 2) score += 0.25;
        if (path.includes("contact") || path.includes("about")) score += 0.15;
        if (path.includes("blog") || path.includes("top-") || path.includes("best-")) score -= 0.25;
        score = Math.max(0, Math.min(1, score));
        if (score > (bestScoreByDomain.get(r.domain) ?? 0)) {
          bestScoreByDomain.set(r.domain, score);
          bestUrlByDomain.set(r.domain, r.url);
        }
      } catch {
        // ignore
      }
    }

    // Create provider call summary rows per city for aggregate visibility.
    // (This does not replace the per-query call logs above, but adds city totals.)
    await logProviderCall({
      jobId: deps.jobId,
      jobType: "DISCOVER_CITY_BATCH",
      provider: providerEnum(provider),
      query: { stateSlug: state.slug, citySlug: city.slug, categories: data.modalitySlugs, text: "city_batch_summary" },
      status: "ok",
      resultCount: resultRows.length,
      invalidUrlCount,
      blockedDomainCount,
      uniqueDomainCount: bestUrlByDomain.size
    });

    const candidateDomains = Array.from(bestUrlByDomain.keys()).filter((d) => !existingSet.has(d));

    // Deterministic throttling ordering (Phase 8):
    // confidence desc, provider priority desc, stable hash asc
    const rankedDomains = candidateDomains
      .map((d) => ({
        d,
        conf: bestScoreByDomain.get(d) ?? 0,
        prio: providerPrio,
        h: stableHash(d)
      }))
      .sort((a, b) => {
        if (b.conf !== a.conf) return b.conf - a.conf;
        if (b.prio !== a.prio) return b.prio - a.prio;
        return a.h - b.h;
      })
      .map((x) => x.d);

    const maxPerCity = cfg.maxDomainsPerCity;
    const allowedDomains = new Set(rankedDomains.slice(0, maxPerCity));

    // Daily cap (soft-observable): compute remaining after existing DRAFT created today.
    const createdToday = await prisma.listing.count({
      where: { createdAt: { gte: startOfTodayUtc() }, moderationStatus: "DRAFT" }
    });
    const remainingDaily = Math.max(0, cfg.maxNewListingsPerDay - createdToday);
    let acceptedThisCity = 0;

    // Build accepted candidates list (unique domains only).
    const acceptedDomainsInOrder = rankedDomains.filter((d) => allowedDomains.has(d)).slice(0, remainingDaily);
    const acceptedDomainSet = new Set(acceptedDomainsInOrder);

    // Create listings for accepted domains (best-effort idempotent).
    if (acceptedDomainsInOrder.length) {
      const candidates: DiscoverCandidate[] = acceptedDomainsInOrder.map((d) => ({
        websiteUrl: `https://${d}`,
        city: city.name,
        state: state.uspsCode
      }));
      const res = await runDiscoverJob({ queryText: `discovery:${state.slug}:${city.slug}:${data.modalitySlugs.join(",")}`, candidates }, deps);
      totalCreated += res.created;
      totalDeduped += res.deduped;
      // We can't map created/deduped per-domain via runDiscoverJob; treat races as skipped_duplicate in ledger by checking DB again below.
      acceptedThisCity = acceptedDomainsInOrder.length;
    }

    // Refresh existence after create for accurate ledger decisions.
    const nowExisting = uniqueDomains.length
      ? await prisma.listing.findMany({
          where: { websiteDomain: { in: uniqueDomains } },
          select: { websiteDomain: true }
        })
      : [];
    const nowExistingSet = new Set(nowExisting.map((e) => e.websiteDomain));

    // Emit exactly one DiscoveryAttempt per candidate domain (no double inserts).
    for (const domain of uniqueDomains) {
      if (!domain) continue;
      const bestUrl = bestUrlByDomain.get(domain) ?? null;
      const conf = bestScoreByDomain.get(domain) ?? null;

      let decision: DiscoveryDecision;
      let reason: string;
      let taxonomyFinal: "pass" | "fail" = "pass";
      let taxonomyRuleId: string | null = "term_allowlist_v1";
      let capRuleId: string | null = null;
      const excluded: string[] = [];

      if (isBlockedHostname(domain)) {
        totalBlocked++;
        decision = "skipped_taxonomy";
        taxonomyFinal = "fail";
        taxonomyRuleId = "domain_blocklist_v1";
        excluded.push(`blocked_domain:${domain}`);
        reason = `blocked domain by rule domain_blocklist_v1: ${domain}`;
      } else if (existingSet.has(domain)) {
        totalExistingDomains++;
        decision = "skipped_duplicate";
        reason = `domain already exists: ${domain}`;
      } else {
        // Throttle / cap decisions.
        if (!allowedDomains.has(domain)) {
          const rank = rankedDomains.indexOf(domain) + 1;
          decision = "skipped_throttle_ranked";
          reason = `throttle ranked drop: rank=${rank} max_per_city=${maxPerCity} domain=${domain}`;
        } else if (!acceptedDomainSet.has(domain)) {
          // Daily cap blocks acceptance deterministically after ranking.
          decision = "skipped_cap";
          capRuleId = "daily_ingest_cap_v1";
          reason = `daily cap exceeded: current_count=${createdToday} max_allowed=${cfg.maxNewListingsPerDay} domain=${domain}`;
        } else if (!nowExistingSet.has(domain)) {
          // Listing creation should have created it; if not, that's an internal failure.
          decision = "provider_error";
          reason = `internal error: accepted domain did not materialize as listing: ${domain}`;
        } else {
          totalCandidates++;
          decision = "accepted";
          const rank = rankedDomains.indexOf(domain) + 1;
          reason = `accepted: rank=${rank} max_per_city=${maxPerCity} domain=${domain}`;
        }
      }

      await appendDiscoveryAttempt({
        jobId: deps.jobId,
        jobType: "DISCOVER_CITY_BATCH",
        provider: providerEnum(provider),
        rawCity: city.slug,
        rawState: state.slug,
        rawCountry: "US",
        rawCategory: data.modalitySlugs.join(","),
        rawName: null,
        rawAddress: null,
        normalizedKey: domain,
        confidenceScore: conf,
        decision,
        decisionReason: `${reason}${bestUrl ? ` | best_url=${bestUrl}` : ""}`,
        taxonomyRuleId,
        capRuleId,
        providerErrorCode: decision === "provider_error" ? "INTERNAL" : null,
        providerErrorRetryable: decision === "provider_error" ? false : null,
        providerErrorType: decision === "provider_error" ? "other" : null,
        payloadExcerpt: decision === "provider_error" ? (bestUrl ? bestUrl.slice(0, 500) : null) : null,
        taxonomy: {
          inputCategory: data.modalitySlugs.join(","),
          matchedCategories: modalities.map((m) => m.slug),
          excludedCategories: excluded,
          finalDecision: taxonomyFinal,
          taxonomyRuleId
        }
      });
      totalAttempts++;
    }

    // Never short-circuit other cities; caps are observable via per-attempt decisions.
  }

  const note = JSON.stringify({
    state: state.slug,
    cities: data.citySlugs.length,
    modalities: data.modalitySlugs.length,
    sampleQueries,
    providerCalls,
    results: {
      blocked: totalBlocked,
      invalidUrls: totalInvalidUrls,
      existingDomains: totalExistingDomains
    },
    attempts: totalAttempts,
    accepted: totalCandidates,
    created: totalCreated,
    deduped: totalDeduped
  });

  await logSystemTaskRun({
    taskName: "DISCOVER_CITY_BATCH",
    taskType: "CRAWL",
    scopeType: "STATE",
    scopeTarget: state.slug,
    cronExpr,
    lastStatus:
      providerCalls.ok + providerCalls.empty + providerCalls.error === 0
        ? "ERROR"
        : totalCreated === 0 && totalCandidates === 0
          ? "SKIPPED"
          : "SUCCESS",
    durationMs: Date.now() - started,
    note
  });

  if (totalAttempts === 0 && providerCalls.ok + providerCalls.empty + providerCalls.error === 0) {
    // True silence: no provider calls and no attempts.
    throw new Error("Phase 8 invariant violated: provider_calls == 0 and discovery_attempts == 0");
  }

  return { created: totalCreated, deduped: totalDeduped, candidates: totalCandidates };
}


