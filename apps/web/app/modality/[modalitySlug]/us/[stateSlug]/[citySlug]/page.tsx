import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "../../../../../../src/lib/prisma";
import { PUBLIC_LISTING_WHERE } from "../../../../../../src/lib/publicFilters";
import { Pagination } from "../../../../../../src/components/Pagination";
import { intParam, firstParam } from "../../../../../../src/lib/searchParams";
import { JsonLd } from "../../../../../../src/components/JsonLd";
import { canonicalUrl } from "../../../../../../src/lib/seo";

export const revalidate = 3600;

export async function generateMetadata({
  params
}: {
  params: { modalitySlug: string; stateSlug: string; citySlug: string };
}): Promise<Metadata> {
  const modality = await prisma.modality.findUnique({
    where: { slug: params.modalitySlug },
    select: { displayName: true, slug: true, isActive: true }
  });
  if (!modality || !modality.isActive) return { title: "Not found" };

  const city = await prisma.city.findFirst({
    where: {
      slug: params.citySlug,
      state: { slug: params.stateSlug, country: { iso2: "US" } }
    },
    select: { name: true, slug: true, state: { select: { name: true, slug: true, uspsCode: true } } }
  });
  if (!city) return { title: "Not found" };

  const title = `${modality.displayName} practitioners in ${city.name}, ${city.state.name}`;
  return {
    title,
    description: `Browse approved ${modality.displayName} listings in ${city.name}, ${city.state.name}.`,
    alternates: { canonical: `/modality/${modality.slug}/us/${city.state.slug}/${city.slug}` },
    robots: { index: true, follow: true }
  };
}

export default async function ModalityCityPage({
  params,
  searchParams
}: {
  params: { modalitySlug: string; stateSlug: string; citySlug: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const sp = searchParams ?? {};
  const page = intParam(sp.page, 1);
  const pageSize = 20;
  const sortParam = firstParam(sp.sort);
  const sort = sortParam === "recent" ? "recent" : "alpha";

  const modality = await prisma.modality.findUnique({
    where: { slug: params.modalitySlug },
    select: { id: true, displayName: true, slug: true, isActive: true }
  });
  if (!modality || !modality.isActive) return notFound();

  const city = await prisma.city.findFirst({
    where: {
      slug: params.citySlug,
      state: { slug: params.stateSlug, country: { iso2: "US" } }
    },
    select: { id: true, name: true, slug: true, state: { select: { id: true, name: true, slug: true, uspsCode: true } } }
  });
  if (!city) return notFound();

  const where = {
    ...PUBLIC_LISTING_WHERE,
    modalities: { some: { modalityId: modality.id } },
    locations: { some: { deletedAt: null, cityId: city.id } }
  };

  const orderBy =
    sort === "recent"
      ? [{ lastVerifiedAt: { sort: "desc" as const, nulls: "last" as const } }]
      : [{ displayName: "asc" as const }];

  const [total, listings] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        modalities: { include: { modality: true } }
      }
    })
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${modality.displayName} practitioners in ${city.name}, ${city.state.name}`,
    url: canonicalUrl(`/modality/${modality.slug}/us/${city.state.slug}/${city.slug}`),
    isPartOf: { "@type": "WebSite", name: "findwellnessnearme.org", url: canonicalUrl("/") }
  };

  return (
    <div className="fnm-stack fnm-gap-md fnm-prose">
      <JsonLd data={jsonLd} />
      <h1 className="fnm-title">
        {modality.displayName} in {city.name}, {city.state.uspsCode}
      </h1>
      <div className="fnm-text-sm fnm-muted">
        Approved listings only.{" "}
        <a href={`/modality/${modality.slug}/us/${city.state.slug}`}>Back to {city.state.name}</a>
      </div>

      <div className="fnm-text-sm fnm-muted">
        Sort: <a href={`?sort=alpha`}>alphabetical</a> · <a href={`?sort=recent`}>recently verified</a>
      </div>

      <div className="fnm-text-sm fnm-muted">
        {total} result{total === 1 ? "" : "s"}
      </div>

      {listings.length ? (
        <ol className="fnm-list fnm-stack fnm-gap-md">
          {listings.map((l) => {
            const modalityNames = l.modalities.map((lm) => lm.modality.displayName).sort();
            return (
              <li key={l.id}>
                <div className="fnm-semibold">
                  <a href={`/listing/${l.id}`}>{l.displayName}</a>
                </div>
                <div className="fnm-text-sm fnm-muted">{modalityNames.join(", ")}</div>
                {l.summary ? <div className="fnm-mt-xs">{l.summary}</div> : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <div>No approved listings yet.</div>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        makeHref={(p) => `?sort=${sort}&page=${p}`}
      />
    </div>
  );
}


