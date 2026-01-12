import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  alternates: { canonical: "/terms" }
};

export default function TermsPage() {
  return (
    <div className="fnm-stack fnm-gap-md fnm-prose">
      <h1 className="fnm-title fnm-h1">Terms &amp; Conditions</h1>

      <p className="fnm-muted">
        Effective date: {new Date().getFullYear()}-01-01. This page is provided as a baseline legal notice for an
        informational directory and may be updated.
      </p>

      <h2 className="fnm-title fnm-h2">Informational directory only</h2>
      <p>
        FindWellnessNearMe.org is an informational directory. Listings are presented for reference purposes and are not
        endorsements, ratings, recommendations, or guarantees of quality, safety, or outcomes.
      </p>

      <h2 className="fnm-title fnm-h2">No medical or professional advice</h2>
      <p>
        Content on this site is not medical, legal, or professional advice. You are responsible for your own decisions
        and for verifying information with providers or other sources.
      </p>

      <h2 className="fnm-title fnm-h2">No guarantees</h2>
      <p>
        We do not guarantee that any listing is accurate, complete, current, or suitable for any purpose. Availability,
        pricing, credentials, services, and other details may change without notice.
      </p>

      <h2 className="fnm-title fnm-h2">Use of publicly available information</h2>
      <p>
        Listings may be summarized or normalized from providers&apos; publicly available websites and other public sources.
        Trademarks and brand names belong to their respective owners.
      </p>

      <h2 className="fnm-title fnm-h2">Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, FindWellnessNearMe.org and its operators are not liable for any damages
        arising from your use of the site or reliance on its content.
      </p>

      <h2 className="fnm-title fnm-h2">Changes to the service</h2>
      <p>
        We may update, remove, or change features, listings, or content at any time. We may also update these Terms as
        the site evolves.
      </p>

      <h2 className="fnm-title fnm-h2">Governing jurisdiction</h2>
      <p>
        These Terms are intended to be governed by applicable laws in a generally applicable jurisdiction, until a
        specific jurisdiction is designated.
      </p>
    </div>
  );
}


