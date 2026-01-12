import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "../../../src/lib/prisma";
import { PUBLIC_LISTING_WHERE } from "../../../src/lib/publicFilters";
import { JsonLd } from "../../../src/components/JsonLd";
import { canonicalUrl } from "../../../src/lib/seo";

export const revalidate = 3600;

export async function generateMetadata({
  params
}: {
  params: { modalitySlug: string };
}): Promise<Metadata> {
  const modality = await prisma.modality.findUnique({
    where: { slug: params.modalitySlug },
    select: { displayName: true, slug: true }
  });
  if (!modality) return { title: "Modality not found" };
  return {
    title: modality.displayName,
    description: `Browse approved listings for ${modality.displayName}.`,
    alternates: { canonical: `/modality/${modality.slug}` },
    robots: { index: true, follow: true }
  };
}

export default async function ModalityLandingPage({
  params
}: {
  params: { modalitySlug: string };
}) {
  const modality = await prisma.modality.findUnique({
    where: { slug: params.modalitySlug },
    select: { id: true, displayName: true, slug: true, parentId: true, isActive: true }
  });
  if (!modality || !modality.isActive) return notFound();

  // Count approved listings by city for this modality, then roll up to states.
  const cityCounts = await prisma.listingLocation.groupBy({
    by: ["cityId"],
    where: {
      deletedAt: null,
      listing: { ...PUBLIC_LISTING_WHERE, modalities: { some: { modalityId: modality.id } } }
    },
    _count: { _all: true }
  });

  const cityIds = cityCounts.map((c) => c.cityId);
  const cities = cityIds.length
    ? await prisma.city.findMany({
        where: { id: { in: cityIds } },
        select: { id: true, name: true, slug: true, state: { select: { name: true, slug: true, uspsCode: true } } }
      })
    : [];

  const countByCityId = new Map(cityCounts.map((c) => [c.cityId, c._count._all]));

  const stateRollup = new Map<string, { stateSlug: string; stateName: string; uspsCode: string; count: number }>();
  for (const c of cities) {
    const n = countByCityId.get(c.id) ?? 0;
    const key = c.state.slug;
    const cur = stateRollup.get(key) ?? {
      stateSlug: c.state.slug,
      stateName: c.state.name,
      uspsCode: c.state.uspsCode,
      count: 0
    };
    cur.count += n;
    stateRollup.set(key, cur);
  }

  const topStates = Array.from(stateRollup.values())
    .sort((a, b) => b.count - a.count || a.stateName.localeCompare(b.stateName))
    .slice(0, 20);

  const topCities = cities
    .map((c) => ({
      cityName: c.name,
      citySlug: c.slug,
      stateSlug: c.state.slug,
      stateCode: c.state.uspsCode,
      count: countByCityId.get(c.id) ?? 0
    }))
    .sort((a, b) => b.count - a.count || a.cityName.localeCompare(b.cityName))
    .slice(0, 30);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: modality.displayName,
    url: canonicalUrl(`/modality/${modality.slug}`),
    isPartOf: { "@type": "WebSite", name: "findwellnessnearme.org", url: canonicalUrl("/") }
  };

  return (
    <div className="fnm-stack fnm-gap-md fnm-prose">
      <JsonLd data={jsonLd} />
      <h1 className="fnm-title">{modality.displayName}</h1>
      <p>
        This page lists approved directory entries that mention this modality on the practitioner’s own public website.
      </p>

      {topStates.length ? (
        <section className="fnm-section">
          <h2 className="fnm-title">States</h2>
          <ul className="fnm-list fnm-mt-sm">
            {topStates.map((s) => (
              <li key={s.stateSlug}>
                <a href={`/modality/${modality.slug}/us/${s.stateSlug}`}>
                  {s.stateName} ({s.uspsCode})
                </a>{" "}
                <span className="fnm-text-sm fnm-dim">({s.count})</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div>No approved listings yet.</div>
      )}

      {topCities.length ? (
        <section className="fnm-section">
          <h2 className="fnm-title">Cities</h2>
          <ul className="fnm-list fnm-mt-sm">
            {topCities.map((c) => (
              <li key={`${c.stateSlug}/${c.citySlug}`}>
                <a href={`/modality/${modality.slug}/us/${c.stateSlug}/${c.citySlug}`}>
                  {c.cityName}, {c.stateCode}
                </a>{" "}
                <span className="fnm-text-sm fnm-dim">({c.count})</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}


