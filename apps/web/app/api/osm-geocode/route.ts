import { NextResponse } from "next/server";

type CacheEntry = { at: number; value: { lat: number; lng: number } | null };
const cache = new Map<string, CacheEntry>();
let lastFetchAt = 0;

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d
const MIN_INTERVAL_MS = 1100; // be polite to Nominatim (≈1 req/s)

function now() {
  return Date.now();
}

function cleanCache() {
  const t = now();
  for (const [k, v] of cache) {
    if (t - v.at > TTL_MS) cache.delete(k);
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const addressRaw = (searchParams.get("address") ?? "").trim();
  if (!addressRaw) return NextResponse.json({ lat: null, lng: null }, { status: 200 });

  const address = addressRaw.slice(0, 300);
  cleanCache();
  const hit = cache.get(address);
  if (hit && now() - hit.at <= TTL_MS) {
    return NextResponse.json(hit.value ? hit.value : { lat: null, lng: null }, { status: 200 });
  }

  const t = now();
  if (t - lastFetchAt < MIN_INTERVAL_MS) {
    // Return a cache-miss default rather than hammering. Client will show "not found" and can retry later.
    return NextResponse.json({ lat: null, lng: null }, { status: 200 });
  }
  lastFetchAt = t;

  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("format", "json");
  u.searchParams.set("limit", "1");
  u.searchParams.set("q", address);

  const userAgent = process.env.CRAWLER_USER_AGENT ?? "findwellnessnearme.org (osm-geocode)";

  const res = await fetch(u.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent
    },
    // Best-effort caching hint (still cached in-memory above).
    cache: "no-store"
  }).catch(() => null);

  if (!res || !res.ok) {
    cache.set(address, { at: now(), value: null });
    return NextResponse.json({ lat: null, lng: null }, { status: 200 });
  }

  const json = (await res.json().catch(() => null)) as any;
  const row = Array.isArray(json) ? json[0] : null;
  const lat = row?.lat ? Number(row.lat) : NaN;
  const lng = row?.lon ? Number(row.lon) : NaN;

  const value = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  cache.set(address, { at: now(), value });
  return NextResponse.json(value ? value : { lat: null, lng: null }, { status: 200 });
}


