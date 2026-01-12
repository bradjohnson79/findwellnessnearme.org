import { createHash } from "node:crypto";
import robotsParser from "robots-parser";
import { chromium, type Browser } from "playwright";
import type { Queue } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { numberEnv, optionalEnv } from "../lib/env.js";
import { buildSameHostUrl, sameHost } from "../lib/url.js";
import type { CrawlJobData } from "../types.js";

type CrawlPageResult = {
  path: string;
  ok: boolean;
  httpStatus: number | null;
  finalUrl: string | null;
  title: string | null;
  h1: string | null;
  h2: string[];
  metaDescription: string | null;
  // Derived-only booleans (no copied prose).
  hasEmail: boolean;
  hasPhone: boolean;
  // Optional geo coordinates from structured data (no tracking; no external calls).
  geo: { lat: number; lng: number } | null;
  // Optional postal address from structured data (conservative; no scraping guesses).
  address: {
    streetAddress: string | null;
    addressLocality: string | null;
    addressRegion: string | null;
    postalCode: string | null;
  } | null;
};

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function now() {
  return new Date();
}

function userAgent() {
  return (
    optionalEnv("CRAWLER_USER_AGENT") ?? "wellnessnearme-bot/0.1 (+https://findwellnessnearme.org)"
  );
}

function crawlTimeoutMs() {
  return numberEnv("CRAWL_TIMEOUT_MS", 10_000);
}

function maxPages() {
  return numberEnv("CRAWL_MAX_PAGES", 4);
}

async function fetchRobotsTxt(baseUrl: string): Promise<string | null> {
  const u = new URL(baseUrl);
  u.pathname = "/robots.txt";
  u.search = "";
  u.hash = "";
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(u.toString(), {
      headers: { "User-Agent": userAgent() },
      redirect: "follow",
      signal: controller.signal
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function allowedPathsByPolicy(): string[] {
  // Tier-1 verification scope only (explicitly limited).
  return ["/", "/about", "/services", "/contact"];
}

async function crawlPage(browser: Browser, url: string, path: string): Promise<CrawlPageResult> {
  const page = await browser.newPage({ userAgent: userAgent() });
  try {
    const res = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: crawlTimeoutMs()
    });

    const httpStatus = res?.status() ?? null;
    const finalUrl = res?.url() ?? page.url() ?? null;

    // Extract minimal signals; do not store raw text publicly.
    const title = (await page.title().catch(() => "")) || null;

    const metaDescription = await page
      .$eval('meta[name="description"]', (el) => (el as HTMLMetaElement).content || "")
      .then((x) => (x.trim() ? x.trim() : null))
      .catch(() => null);

    const h1 = await page
      .$eval("h1", (el) => (el.textContent || "").trim())
      .then((x) => (x ? x.slice(0, 160) : null))
      .catch(() => null);

    const h2 = await page
      .$$eval("h2", (els) => els.map((e) => (e.textContent || "").trim()).filter(Boolean))
      .then((xs) => xs.slice(0, 25).map((x) => x.slice(0, 160)))
      .catch(() => []);

    // Derived-only signals (we scan the page text but do not store it).
    const bodyText = await page
      .evaluate(() => document.body?.innerText || "")
      .then((t) => t.slice(0, 50_000))
      .catch(() => "");

    const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(bodyText);
    const hasPhone = /(\+?1[\s.-]?)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/.test(bodyText);

    // Extract geo from JSON-LD if present (provider-agnostic, conservative).
    const jsonLdTexts = await page
      .$$eval('script[type="application/ld+json"]', (els) =>
        els.map((el) => (el.textContent || "").trim()).filter(Boolean)
      )
      .catch(() => []);

    const geo = await Promise.resolve(jsonLdTexts)
      .then((jsonTexts) => {
        function asArray(x: any): any[] {
          if (!x) return [];
          return Array.isArray(x) ? x : [x];
        }
        function findGeo(obj: any): { lat: number; lng: number } | null {
          if (!obj || typeof obj !== "object") return null;
          const candidate = obj.geo ?? obj?.location?.geo ?? null;
          const geoObj = candidate && typeof candidate === "object" ? candidate : null;
          const latRaw = geoObj?.latitude ?? geoObj?.lat ?? null;
          const lngRaw = geoObj?.longitude ?? geoObj?.lng ?? null;
          const lat = Number(latRaw);
          const lng = Number(lngRaw);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
          return { lat, lng };
        }
        function walk(o: any): { lat: number; lng: number } | null {
          if (!o) return null;
          if (Array.isArray(o)) {
            for (const it of o) {
              const v = walk(it);
              if (v) return v;
            }
            return null;
          }
          if (typeof o === "object") {
            const direct = findGeo(o);
            if (direct) return direct;
            const graph = o["@graph"];
            if (graph) {
              const v = walk(graph);
              if (v) return v;
            }
            return null;
          }
          return null;
        }

        for (const t of jsonTexts) {
          try {
            const parsed = JSON.parse(t);
            const objs = asArray(parsed);
            const v = walk(objs);
            if (v) return v;
          } catch {
            // ignore malformed JSON-LD blocks
          }
        }
        return null;
      })
      .catch(() => null);

    // Extract a structured postal address from JSON-LD if present.
    const address = await Promise.resolve(jsonLdTexts)
      .then((jsonTexts) => {
        function asArray(x: any): any[] {
          if (!x) return [];
          return Array.isArray(x) ? x : [x];
        }
        function normalizeAddr(a: any) {
          if (!a || typeof a !== "object") return null;
          const streetAddress =
            typeof a.streetAddress === "string" ? a.streetAddress.trim().slice(0, 160) : null;
          const addressLocality =
            typeof a.addressLocality === "string" ? a.addressLocality.trim().slice(0, 80) : null;
          const addressRegion =
            typeof a.addressRegion === "string" ? a.addressRegion.trim().slice(0, 40) : null;
          const postalCode =
            typeof a.postalCode === "string" ? a.postalCode.trim().slice(0, 20) : null;
          if (!(streetAddress || addressLocality || addressRegion || postalCode)) return null;
          return { streetAddress, addressLocality, addressRegion, postalCode };
        }
        function findAddr(obj: any) {
          if (!obj || typeof obj !== "object") return null;
          const candidate =
            obj.address ?? obj?.location?.address ?? obj?.provider?.address ?? obj?.containedInPlace?.address ?? null;
          if (!candidate) return null;
          if (typeof candidate === "string") return null; // too ambiguous; ignore
          return normalizeAddr(candidate);
        }
        function walk(o: any): any | null {
          if (!o) return null;
          if (Array.isArray(o)) {
            for (const it of o) {
              const v = walk(it);
              if (v) return v;
            }
            return null;
          }
          if (typeof o === "object") {
            const direct = findAddr(o);
            if (direct) return direct;
            const graph = o["@graph"];
            if (graph) return walk(graph);
            return null;
          }
          return null;
        }
        for (const t of jsonTexts) {
          try {
            const parsed = JSON.parse(t);
            const v = walk(asArray(parsed));
            if (v) return v;
          } catch {
            // ignore malformed JSON-LD blocks
          }
        }
        return null;
      })
      .catch(() => null);

    return {
      path,
      ok: httpStatus ? httpStatus >= 200 && httpStatus < 500 : false,
      httpStatus,
      finalUrl,
      title,
      h1,
      h2,
      metaDescription,
      hasEmail,
      hasPhone,
      geo,
      address
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function meetsTier1VerificationCriteria(args: {
  homepage: CrawlPageResult | null;
  robotsAllowed: boolean | null;
}) {
  // Boring MVP criteria:
  // - homepage reached and returned 2xx/3xx
  // - robots allowed (unknown treated as allowed, but we record it)
  // - at least a title or h1 exists
  const h = args.homepage;
  if (!h) return false;
  if (!h.httpStatus) return false;
  if (h.httpStatus < 200 || h.httpStatus >= 400) return false;
  if (args.robotsAllowed === false) return false;
  if (!(h.title || h.h1)) return false;
  return true;
}

export async function runCrawlJob(
  data: CrawlJobData,
  deps: { queue: Queue }
): Promise<{ crawlAttemptId: string; verified: boolean; status: string }> {
  const listing = await prisma.listing.findUnique({
    where: { id: data.listingId },
    select: { id: true, websiteUrl: true, websiteDomain: true, moderationStatus: true }
  });
  if (!listing) throw new Error("Listing not found");

  const startedAt = now();
  let finishedAt: Date | null = null;

  // Robots check (polite, auditable).
  const robotsTxt = await fetchRobotsTxt(listing.websiteUrl);
  const robots = robotsTxt
    ? robotsParser(buildSameHostUrl(listing.websiteUrl, "/robots.txt"), robotsTxt)
    : null;
  const ua = userAgent();

  const policyPaths = allowedPathsByPolicy().slice(0, maxPages());
  const candidateUrls = policyPaths.map((p) => ({ path: p, url: buildSameHostUrl(listing.websiteUrl, p) }));

  // Ensure same host (Tier-1 boundary).
  for (const c of candidateUrls) {
    if (!sameHost(c.url, listing.websiteUrl)) {
      throw new Error("Tier-1 boundary violation: attempted cross-host crawl");
    }
  }

  const allowed = candidateUrls.filter((c) => {
    if (!robots) return true; // unknown robots => allowed (but recorded as null)
    return robots.isAllowed(c.url, ua);
  });

  if (!allowed.length) {
    finishedAt = now();
    const attempt = await prisma.$transaction(async (tx) => {
      const created = await tx.crawlAttempt.create({
        data: {
          listingId: listing.id,
          purpose: "VERIFICATION",
          targetUrl: listing.websiteUrl,
          startedAt,
          finishedAt,
          status: "BLOCKED_ROBOTS",
          httpStatus: null,
          robotsAllowed: false,
          contentSha256: null,
          storageKey: null,
          extractedData: {
            pages: [],
            policyPaths,
            note: "All policy paths blocked by robots.txt"
          }
        }
      });

      await tx.listing.update({
        where: { id: listing.id },
        data: {
          lastCrawledAt: finishedAt,
          verificationStatus: "FAILED"
        }
      });

      return created;
    });

    return { crawlAttemptId: attempt.id, verified: false, status: "BLOCKED_ROBOTS" };
  }

  let browser: Browser | null = null;
  const pages: CrawlPageResult[] = [];
  let status: "SUCCESS" | "HTTP_ERROR" | "TIMEOUT" | "PARSE_ERROR" | "UNKNOWN_ERROR" = "SUCCESS";

  try {
    browser = await chromium.launch({ headless: true });

    for (const c of allowed) {
      pages.push(await crawlPage(browser, c.url, c.path));
    }
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.toLowerCase().includes("timeout")) status = "TIMEOUT";
    else status = "UNKNOWN_ERROR";
  } finally {
    finishedAt = now();
    await browser?.close().catch(() => {});
  }

  const homepage = pages.find((p) => p.path === "/") ?? pages[0] ?? null;
  const robotsAllowed = robots ? true : null; // if robotsTxt missing, unknown
  // Detect cross-host redirects (treat as failure; can be a domain takeover / unrelated content).
  const crossHostRedirect = pages.some((p) => p.finalUrl && !sameHost(p.finalUrl, listing.websiteUrl));
  if (crossHostRedirect) status = "HTTP_ERROR";

  const verified = status === "SUCCESS" && meetsTier1VerificationCriteria({ homepage, robotsAllowed });

  // Internal-only hash over extracted minimal signals (no raw prose).
  const hashInput = JSON.stringify({
    websiteDomain: listing.websiteDomain,
    pages: pages.map((p) => ({
      path: p.path,
      httpStatus: p.httpStatus,
      title: p.title,
      h1: p.h1,
      h2: p.h2,
      metaDescription: p.metaDescription,
      hasEmail: p.hasEmail,
      hasPhone: p.hasPhone
    }))
  });
  const contentSha256 = sha256Hex(hashInput);

  const attempt = await prisma.$transaction(async (tx) => {
    const created = await tx.crawlAttempt.create({
      data: {
        listingId: listing.id,
        purpose: "VERIFICATION",
        targetUrl: listing.websiteUrl,
        startedAt,
        finishedAt,
        status,
        httpStatus: homepage?.httpStatus ?? null,
        robotsAllowed,
        contentSha256,
        storageKey: null,
        extractedData: {
          pages,
          policyPaths,
          userAgent: ua,
          crossHostRedirect
        }
      }
    });

    await tx.listing.update({
      where: { id: listing.id },
      data: {
        lastCrawledAt: finishedAt,
        verificationStatus: verified ? "VERIFIED" : "FAILED",
        lastVerifiedAt: verified ? finishedAt : null
      }
    });

    // Phase 6B: flag attention on certain failures for approved listings (never unpublish automatically).
    if (!verified && listing.moderationStatus === "APPROVED") {
      let reason: string | null = null;
      if (crossHostRedirect) reason = "domain_redirect_cross_host";
      else if (status === "TIMEOUT" || status === "HTTP_ERROR") reason = `crawl_failure_${status.toLowerCase()}`;
      if (reason) {
        await tx.listingModerationEvent.create({
          data: {
            listingId: listing.id,
            action: "FLAG_ATTENTION",
            reasonCode: null,
            note: `System flag: ${reason}`,
            actorType: "SYSTEM",
            actorName: null
          }
        });
      }
    }

    return created;
  });

  // Phase 6B follow-up: if this listing is APPROVED and the crawl materially changed,
  // enqueue a targeted summary refresh (no visibility change; human gate remains).
  if (attempt.status === "SUCCESS" && attempt.contentSha256) {
    const [latestApproved, prior] = await Promise.all([
      prisma.listing.findUnique({
        where: { id: listing.id },
        select: { moderationStatus: true, summary: true }
      }),
      prisma.crawlAttempt.findFirst({
        where: {
          listingId: listing.id,
          status: "SUCCESS",
          contentSha256: { not: null },
          // exclude current attempt
          id: { not: attempt.id }
        },
        orderBy: [{ startedAt: "desc" }],
        select: { contentSha256: true }
      })
    ]);

    const hashChanged = Boolean(prior?.contentSha256 && prior.contentSha256 !== attempt.contentSha256);
    const shouldRefreshSummary = !latestApproved?.summary || hashChanged;

    if (latestApproved?.moderationStatus === "APPROVED" && shouldRefreshSummary) {
      await deps.queue.add(
        "REFRESH_SUMMARY",
        { listingId: listing.id, reason: hashChanged ? "hash_changed" : "summary_missing" },
        {
          jobId: `refresh-summary-${listing.id}-${attempt.id}`,
          removeOnComplete: 2000,
          removeOnFail: 2000
        }
      );
    }
  }

  if (verified) {
    // Enqueue normalization only after verification passes.
    await deps.queue.add(
      "EXTRACT_AND_NORMALIZE",
      { listingId: listing.id, crawlAttemptId: attempt.id },
      {
        jobId: `extract-${attempt.id}`,
        removeOnComplete: 2000,
        removeOnFail: 2000
      }
    );
  }

  return { crawlAttemptId: attempt.id, verified, status };
}


