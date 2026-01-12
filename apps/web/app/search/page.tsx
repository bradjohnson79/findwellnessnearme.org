import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "../../src/lib/prisma";
import { PUBLIC_LISTING_WHERE } from "../../src/lib/publicFilters";
import { firstParam, intParam } from "../../src/lib/searchParams";
import { Pagination } from "../../src/components/Pagination";
import { JsonLd } from "../../src/components/JsonLd";
import { canonicalUrl } from "../../src/lib/seo";
import { FramedSection } from "../../src/components/FramedSection";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search",
  description: "Search approved wellness practitioner listings.",
  robots: { index: false, follow: true }
};

function buildQueryString(params: Record<string, string | undefined>) {
  const u = new URL("http://local");
  for (const [k, v] of Object.entries(params)) {
    if (v && v.trim()) u.searchParams.set(k, v);
  }
  return u.searchParams.toString();
}

function quoteForDisplay(s: string) {
  const t = s.trim();
  return t ? `“${t}”` : "";
}

export default async function SearchPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const sp = searchParams ?? {};

  const q = (firstParam(sp.q) ?? "").trim();
  const stateSlug = (firstParam(sp.state) ?? "").trim();
  const citySlug = (firstParam(sp.city) ?? "").trim();
  const modalitySlug = (firstParam(sp.modality) ?? "").trim();
  const page = intParam(sp.page, 1);
  const pageSize = 20;

  // Validate location slugs if present.
  let stateId: string | null = null;
  let stateName: string | null = null;
  let stateCode: string | null = null;
  if (stateSlug) {
    const state = await prisma.state.findFirst({
      where: { slug: stateSlug, country: { iso2: "US" } },
      select: { id: true, name: true, slug: true, uspsCode: true }
    });
    if (!state) return notFound();
    stateId = state.id;
    stateName = state.name;
    stateCode = state.uspsCode;
  }

  let cityId: string | null = null;
  let cityName: string | null = null;
  let cityStateCode: string | null = null;
  if (citySlug) {
    if (!stateId) return notFound(); // city requires state
    const city = await prisma.city.findFirst({
      where: { slug: citySlug, stateId },
      select: { id: true, name: true, slug: true, state: { select: { uspsCode: true } } }
    });
    if (!city) return notFound();
    cityId = city.id;
    cityName = city.name;
    cityStateCode = city.state.uspsCode;
  }

  // Validate modality slug if present.
  let modalityId: string | null = null;
  let modalityName: string | null = null;
  if (modalitySlug) {
    const m = await prisma.modality.findUnique({
      where: { slug: modalitySlug },
      select: { id: true, displayName: true, slug: true, isActive: true }
    });
    if (!m) return notFound();
    modalityId = m.id;
    modalityName = m.displayName;
  }

  const where = {
    ...PUBLIC_LISTING_WHERE,
    ...(q
      ? {
          OR: [
            { displayName: { contains: q, mode: "insensitive" as const } },
            { summary: { contains: q, mode: "insensitive" as const } },
            { websiteDomain: { contains: q, mode: "insensitive" as const } }
          ]
        }
      : {}),
    ...(cityId
      ? { locations: { some: { deletedAt: null, cityId } } }
      : stateId
        ? { locations: { some: { deletedAt: null, city: { stateId } } } }
        : {}),
    ...(modalityId ? { modalities: { some: { modalityId } } } : {})
  };

  const orderBy = [{ displayName: "asc" as const }];

  const [total, listings] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        modalities: { include: { modality: true } },
        locations: {
          where: { deletedAt: null },
          include: { city: { include: { state: true } } },
          orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
          take: 1
        }
      }
    })
  ]);

  const chips: Array<{ label: string; href: string }> = [];
  if (stateSlug && stateName) {
    chips.push({
      label: `State: ${stateName}`,
      href: `/search?${buildQueryString({ q, modality: modalitySlug || undefined })}`
    });
  }
  if (citySlug && cityName && stateSlug) {
    chips.push({
      label: `City: ${cityName}`,
      href: `/search?${buildQueryString({ q, state: stateSlug, modality: modalitySlug || undefined })}`
    });
  }
  if (modalitySlug && modalityName) {
    chips.push({
      label: `Modality: ${modalityName}`,
      href: `/search?${buildQueryString({ q, state: stateSlug || undefined, city: citySlug || undefined })}`
    });
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Search",
    url: canonicalUrl("/search"),
    isPartOf: {
      "@type": "WebSite",
      name: "findwellnessnearme.org",
      url: canonicalUrl("/")
    }
  };

  const displayQuery = q || modalityName || "Wellness";
  const displayLocation = cityName
    ? `in ${cityName}, ${cityStateCode ?? stateCode ?? ""}`.trim().replace(/,\s*$/, "")
    : stateName
      ? `in ${stateName}${stateCode ? ` (${stateCode})` : ""}`
      : "";

  return (
    <div className="fnm-stack fnm-gap-md">
      <JsonLd data={jsonLd} />

      <div className="fnm-text-sm fnm-muted fnm-prose">
        Results for {quoteForDisplay(displayQuery)} {displayLocation ? `${displayLocation}` : ""}
      </div>

      <FramedSection title="Wellness Businesses & Practitioners">
        <div className="fnm-stack fnm-gap-md">
          <form method="get" action="/search" className="fnm-stack fnm-gap-sm fnm-prose">
            <label>
              <span className="fnm-text-sm fnm-muted">Search</span>
              <br />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search by name, summary, or domain"
                className="fnm-searchInput"
              />
            </label>
            <input type="hidden" name="state" value={stateSlug} />
            <input type="hidden" name="city" value={citySlug} />
            <input type="hidden" name="modality" value={modalitySlug} />
            <div>
              <button type="submit">Search</button>
            </div>
          </form>

      {!q && !stateSlug && !citySlug && !modalitySlug ? (
          <div className="fnm-text-sm fnm-muted fnm-prose">
            Browse instead: <a href="/">states</a> · <a href="/modalities">modalities</a>
          </div>
      ) : null}

      {chips.length ? (
            <div className="fnm-chipRow fnm-prose">
              {chips.map((c) => (
                <a key={c.label} href={c.href} className="fnm-chip">
                  {c.label} ×
                </a>
              ))}
            </div>
      ) : null}

          <div className="fnm-text-sm fnm-muted fnm-prose">
            {total} result{total === 1 ? "" : "s"}
          </div>

          {listings.length ? (
            <ol className="fnm-resultList fnm-prose">
              {listings.map((l) => {
                const loc = l.locations[0] ?? null;
                const locText = loc ? `${loc.city.name}, ${loc.city.state.uspsCode}` : "Location not listed";
                const modalityNames = l.modalities.map((lm) => lm.modality.displayName).sort();
                const categoryText = modalityNames.length ? modalityNames.join(", ") : "Modalities not specified.";
                return (
                  <li key={l.id}>
                    <a className="fnm-resultLink" href={`/listing/${l.id}`}>
                      <div className="fnm-resultTitle">{l.displayName}</div>
                      <div className="fnm-text-sm fnm-muted">{categoryText}</div>
                      <div className="fnm-text-sm fnm-muted">{locText}</div>
                      {l.summary ? <div className="fnm-mt-xs fnm-clamp-2">{l.summary}</div> : null}
                    </a>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="fnm-prose">
              No wellness businesses found for this search. Try adjusting your location or category.
            </div>
          )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        makeHref={(p) =>
          `/search?${buildQueryString({
            q: q || undefined,
            state: stateSlug || undefined,
            city: citySlug || undefined,
            modality: modalitySlug || undefined,
            page: String(p)
          })}`
        }
      />
        </div>
      </FramedSection>
    </div>
  );
}


