import { prisma } from "../src/lib/prisma";
import { JsonLd } from "../src/components/JsonLd";
import { canonicalUrl } from "../src/lib/seo";
import { FramedSection } from "../src/components/FramedSection";

export const revalidate = 3600;

export default async function HomePage() {
  const us = await prisma.country.findUnique({
    where: { iso2: "US" },
    include: { states: { orderBy: [{ name: "asc" }] } }
  });

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "findwellnessnearme.org",
      url: canonicalUrl("/"),
      potentialAction: {
        "@type": "SearchAction",
        target: `${canonicalUrl("/search")}?q={search_term_string}`,
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Find wellness practitioners in the United States",
      url: canonicalUrl("/")
    }
  ];

  return (
    <div className="fnm-stack fnm-gap-xl">
      <JsonLd data={jsonLd} />
      <h1 className="fnm-title fnm-h1 fnm-prose">Find Wellness Businesses &amp; Practitioners in the United States</h1>

      <FramedSection title="Search Wellness Near You">
        <div className="fnm-stack fnm-gap-sm">
          <form method="get" action="/search" className="fnm-stack fnm-gap-sm">
            <label>
              <span className="fnm-text-sm fnm-muted">Query</span>
              <br />
              <input
                name="q"
                placeholder="Search by name, summary, or domain"
                className="fnm-searchInput"
              />
            </label>
            <div>
              <button type="submit">Search</button>
            </div>
          </form>
          <div className="fnm-text-sm fnm-muted fnm-prose">
            This directory is informational only. Listings are summarized from practitioners’ public websites and appear
            only after human review.
          </div>
        </div>
      </FramedSection>

      <FramedSection title="Browse by State">
          {!us ? (
            <div>Geography not seeded yet.</div>
          ) : (
            <div className="fnm-row fnm-wrap">
              {us.states.map((s) => (
                <a key={s.id} href={`/state/${s.slug}`}>
                  {s.name}
                </a>
              ))}
            </div>
          )}
      </FramedSection>
    </div>
  );
}


