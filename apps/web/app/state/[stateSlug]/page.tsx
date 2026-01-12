import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "../../../src/lib/prisma";
import { PUBLIC_LISTING_WHERE } from "../../../src/lib/publicFilters";
import { JsonLd } from "../../../src/components/JsonLd";
import { canonicalUrl } from "../../../src/lib/seo";

export const revalidate = 3600;

export async function generateMetadata({
  params
}: {
  params: { stateSlug: string };
}): Promise<Metadata> {
  const state = await prisma.state.findFirst({
    where: { slug: params.stateSlug, country: { iso2: "US" } },
    select: { name: true, slug: true }
  });
  if (!state) return { title: "State not found" };
  const title = `Wellness practitioners in ${state.name}`;
  return {
    title,
    description: `Browse approved wellness practitioner listings in ${state.name}.`,
    alternates: { canonical: `/state/${state.slug}` }
  };
}

export default async function StatePage({ params }: { params: { stateSlug: string } }) {
  const state = await prisma.state.findFirst({
    where: { slug: params.stateSlug, country: { iso2: "US" } },
    select: { id: true, name: true, slug: true, uspsCode: true }
  });
  if (!state) return notFound();

  const cityCounts = await prisma.listingLocation.groupBy({
    by: ["cityId"],
    where: {
      deletedAt: null,
      listing: PUBLIC_LISTING_WHERE,
      city: { stateId: state.id }
    },
    _count: { _all: true }
  });

  const cityIds = cityCounts.map((c) => c.cityId);
  const cities = cityIds.length
    ? await prisma.city.findMany({
        where: { id: { in: cityIds } },
        select: { id: true, name: true, slug: true },
        orderBy: [{ name: "asc" }]
      })
    : [];

  const countByCityId = new Map(cityCounts.map((c) => [c.cityId, c._count._all]));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Wellness practitioners in ${state.name}`,
    url: canonicalUrl(`/state/${state.slug}`),
    isPartOf: { "@type": "WebSite", name: "findwellnessnearme.org", url: canonicalUrl("/") }
  };

  return (
    <div className="fnm-stack fnm-gap-md fnm-prose">
      <JsonLd data={jsonLd} />
      <h1 className="fnm-title">Wellness practitioners in {state.name}</h1>

      <section className="fnm-section">
        <h2 className="fnm-title">Cities</h2>
        {cities.length ? (
          <ul className="fnm-list fnm-mt-sm">
            {cities.map((c) => (
              <li key={c.id}>
                <a href={`/state/${state.slug}/${c.slug}`}>{c.name}</a>{" "}
                <span className="fnm-text-sm fnm-dim">
                  ({countByCityId.get(c.id) ?? 0})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div>No approved listings yet.</div>
        )}
      </section>
    </div>
  );
}


