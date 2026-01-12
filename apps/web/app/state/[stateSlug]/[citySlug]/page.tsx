import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "../../../../src/lib/prisma";
import { PUBLIC_LISTING_WHERE } from "../../../../src/lib/publicFilters";
import { JsonLd } from "../../../../src/components/JsonLd";
import { canonicalUrl } from "../../../../src/lib/seo";

export const revalidate = 3600;

export async function generateMetadata({
  params
}: {
  params: { stateSlug: string; citySlug: string };
}): Promise<Metadata> {
  const city = await prisma.city.findFirst({
    where: { slug: params.citySlug, state: { slug: params.stateSlug, country: { iso2: "US" } } },
    select: { name: true, slug: true, state: { select: { name: true, slug: true } } }
  });
  if (!city) return { title: "City not found" };
  const title = `${city.name}, ${city.state.name} wellness practitioners`;
  return {
    title,
    description: `Browse approved wellness practitioner listings in ${city.name}, ${city.state.name}.`,
    alternates: { canonical: `/state/${city.state.slug}/${city.slug}` }
  };
}

export default async function CityPage({
  params
}: {
  params: { stateSlug: string; citySlug: string };
}) {
  const city = await prisma.city.findFirst({
    where: { slug: params.citySlug, state: { slug: params.stateSlug, country: { iso2: "US" } } },
    select: {
      id: true,
      name: true,
      slug: true,
      state: { select: { id: true, name: true, slug: true, uspsCode: true } }
    }
  });
  if (!city) return notFound();

  // Cap results for now (no pagination in Phase 5A).
  const listings = await prisma.listing.findMany({
    where: {
      ...PUBLIC_LISTING_WHERE,
      locations: { some: { deletedAt: null, cityId: city.id } }
    },
    orderBy: [{ displayName: "asc" }],
    take: 200,
    include: {
      modalities: { include: { modality: true } }
    }
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${city.name}, ${city.state.name} wellness practitioners`,
    url: canonicalUrl(`/state/${city.state.slug}/${city.slug}`),
    isPartOf: { "@type": "WebSite", name: "findwellnessnearme.org", url: canonicalUrl("/") }
  };

  return (
    <div className="fnm-stack fnm-gap-md fnm-prose">
      <JsonLd data={jsonLd} />
      <h1 className="fnm-title">
        {city.name}, {city.state.uspsCode}
      </h1>
      <div className="fnm-text-sm fnm-muted">
        Approved listings only. <a href={`/state/${city.state.slug}`}>Back to {city.state.name}</a>
      </div>

      {listings.length ? (
        <ul className="fnm-listPlain fnm-stack fnm-gap-sm">
          {listings.map((l) => {
            const modalityNames = l.modalities.map((lm) => lm.modality.displayName).sort();
            return (
              <li key={l.id}>
                <div className="fnm-semibold">
                  <a href={`/listing/${l.id}`}>{l.displayName}</a>
                </div>
                <div className="fnm-text-sm fnm-muted">
                  {modalityNames.length ? modalityNames.join(", ") : "Modalities not specified."}
                </div>
                {l.summary ? <div className="fnm-mt-xs">{l.summary}</div> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div>No approved listings yet.</div>
      )}

      {listings.length >= 200 ? (
        <div className="fnm-text-sm fnm-muted">
          Showing the first 200 listings (pagination comes later).
        </div>
      ) : null}
    </div>
  );
}


