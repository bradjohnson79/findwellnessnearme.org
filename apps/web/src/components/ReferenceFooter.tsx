import { Logo } from "./Logo";

type Link = { href: string; label: string };
type ModalityLink = { id: string; slug: string; displayName: string };

type Props = {
  modalities: ModalityLink[];
};

/**
 * Phase 9.7 — Footer contract
 * - Text-only navigation
 * - Sections: Search, Modalities, Legal + disclaimer
 * - No brand emphasis, no blue headers
 */
export function ReferenceFooter({ modalities }: Props) {
  const searchLinks: Link[] = [
    { href: "/search", label: "Search Wellness Near You" },
    { href: "/", label: "Browse by Location" }
  ];

  const legalLinks: Link[] = [
    { href: "/contact", label: "Contact" },
    { href: "/terms", label: "Terms & Conditions" },
    { href: "/privacy", label: "Privacy Policy" }
  ];

  return (
    <div className="fnm-footerRef">
      <div className="fnm-container">
        <div className="fnm-mb-sm fnm-footerLogo">
          <a className="fnm-logoLink" href="/">
            <Logo context="footer" />
          </a>
        </div>

        <div className="fnm-footerRefInner">
          <section className="fnm-stack fnm-gap-sm">
            <h2 className="fnm-footerRefHeading">Search</h2>
            <nav aria-label="Search links" className="fnm-footerRefLinks">
              {searchLinks.map((l) => (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
            </nav>
          </section>

          <section className="fnm-stack fnm-gap-sm">
            <h2 className="fnm-footerRefHeading">Modalities</h2>
            <nav aria-label="Modalities links" className="fnm-footerRefLinks">
              {modalities.map((m) => (
                <a key={m.id} href={`/modality/${m.slug}`}>
                  {m.displayName}
                </a>
              ))}
              <a href="/modalities">All modalities</a>
            </nav>
          </section>

          <section className="fnm-stack fnm-gap-sm">
            <h2 className="fnm-footerRefHeading">Legal</h2>
            <nav aria-label="Legal links" className="fnm-footerRefLinks">
              {legalLinks.map((l) => (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
            </nav>
          </section>
        </div>

        <div className="fnm-text-sm fnm-muted fnm-mt-lg">
          Listings are informational only. No endorsements, ratings, or reviews.
        </div>
      </div>
    </div>
  );
}


