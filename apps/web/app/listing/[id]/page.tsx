import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "../../../src/lib/prisma";
import { PUBLIC_LISTING_WHERE } from "../../../src/lib/publicFilters";
import { JsonLd } from "../../../src/components/JsonLd";
import { canonicalUrl } from "../../../src/lib/seo";
import { AdPlaceholder } from "../../../src/components/AdPlaceholder";
import { LocationMapSection } from "../../../src/components/LocationMapSection";

export const revalidate = 3600;

export async function generateMetadata({
  params
}: {
  params: { id: string };
}): Promise<Metadata> {
  const listing = await prisma.listing.findFirst({
    where: { id: params.id, ...PUBLIC_LISTING_WHERE },
    select: { displayName: true, summary: true }
  });
  if (!listing) return { title: "Listing not found" };
  return {
    title: listing.displayName,
    description: listing.summary ?? "Informational listing.",
    alternates: { canonical: `/listing/${params.id}` }
  };
}

export default async function ListingDetailPage({ params }: { params: { id: string } }) {
  const listing = await prisma.listing.findFirst({
    where: { id: params.id, ...PUBLIC_LISTING_WHERE },
    include: {
      modalities: { include: { modality: true } },
      locations: {
        where: { deletedAt: null },
        include: { city: { include: { state: true } } },
        orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
        take: 5
      }
    }
  });
  if (!listing) return notFound();

  const modalityNames = listing.modalities.map((lm) => lm.modality.displayName).sort();
  const primaryLoc = listing.locations[0] ?? null;

  const visibility = primaryLoc?.addressVisibility ?? "CITY_ONLY";
  function safeStreet(s: string | null | undefined): string | null {
    const t = (s ?? "").trim();
    if (!t) return null;
    const lower = t.toLowerCase();
    // Never display apartment/unit/private residence identifiers (conservative).
    if (/(^|\\s)(apt|apartment|unit|#|lot)\\b/.test(lower)) return null;
    return t;
  }
  const street1 = safeStreet(primaryLoc?.street1);
  const street2 = safeStreet(primaryLoc?.street2);

  const cityState = primaryLoc ? `${primaryLoc.city.name}, ${primaryLoc.city.state.uspsCode}` : null;
  const fullAddress =
    primaryLoc && visibility === "PUBLIC"
      ? [street1, street2, cityState, primaryLoc.postalCode, "US"].filter(Boolean).join(", ")
      : null;
  const locationText = fullAddress ?? cityState;

  const geocodeQuery = primaryLoc
    ? visibility === "PUBLIC" && fullAddress
      ? fullAddress
      : `${primaryLoc.city.name}, ${primaryLoc.city.state.uspsCode}, US`
    : null;
  const pageUrl = canonicalUrl(`/listing/${listing.id}`);

  const jsonLd: any = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: listing.displayName,
    url: listing.websiteUrl,
    mainEntityOfPage: pageUrl,
    serviceType: modalityNames.length ? modalityNames : undefined
  };
  if (primaryLoc) {
    jsonLd.areaServed = `${primaryLoc.city.name}, ${primaryLoc.city.state.name}`;
    jsonLd.address = {
      "@type": "PostalAddress",
      addressLocality: primaryLoc.city.name,
      addressRegion: primaryLoc.city.state.uspsCode,
      addressCountry: "US"
    };
  }

  return (
    <div className="fnm-stack fnm-gap-md">
      <JsonLd data={jsonLd} />
      <AdPlaceholder />
      <div className="fnm-stack fnm-gap-md fnm-prose">
        <h1 className="fnm-title fnm-h1">{listing.displayName}</h1>

        {primaryLoc && locationText ? <div className="fnm-text-sm fnm-muted">{locationText}</div> : null}

        {modalityNames.length ? (
          <div className="fnm-text-sm fnm-muted">{modalityNames.join(" · ")}</div>
        ) : (
          <div className="fnm-text-sm fnm-muted">Modalities not specified.</div>
        )}

        {listing.summary ? <div>{listing.summary}</div> : null}

        <div className="fnm-text-sm fnm-muted">
          Information summarized from the practitioner’s public website.
        </div>

        <div className="fnm-mt-xs fnm-ctaCenter">
          <a className="fnm-ctaButton" href={listing.websiteUrl} target="_blank" rel="noreferrer">
            Visit Business Listing&apos;s Website
          </a>
        </div>

        <div className="fnm-mt-xs fnm-text-sm">
          <a href={`/listing/${listing.id}/request?type=CLAIM`}>Claim this listing</a> ·{" "}
          <a href={`/listing/${listing.id}/request?type=CORRECTION`}>Request a factual correction</a>
        </div>

        {listing.locations.length ? (
          <section className="fnm-mt-md">
            <h2 className="fnm-title">Locations</h2>
            <ul className="fnm-list fnm-mt-sm">
              {listing.locations.map((loc) => {
                const vis = loc.addressVisibility ?? "CITY_ONLY";
                const s1 = safeStreet(loc.street1);
                const s2 = safeStreet(loc.street2);
                const cs = `${loc.city.name}, ${loc.city.state.uspsCode}`;
                const addr =
                  vis === "PUBLIC" ? [s1, s2, cs, loc.postalCode, "US"].filter(Boolean).join(", ") : cs;
                return <li key={loc.id}>{addr}</li>;
              })}
            </ul>
          </section>
        ) : null}
      </div>

      {/* Phase 9.5.15+ — map appears after informational content and before footer */}
      <LocationMapSection geocodeQuery={geocodeQuery} tooltipLabel={locationText} />
    </div>
  );
}


