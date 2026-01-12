import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Advertising Policy",
  alternates: { canonical: "/advertising/policy" }
};

export default function AdvertisingPolicyPage() {
  return (
    <div className="fnm-stack fnm-gap-md fnm-prose">
      <h1 className="fnm-title fnm-h1">Advertising Policy &amp; Featured Listing Rules</h1>

      <p className="fnm-muted">
        Advertising provides visibility, not endorsement. This policy exists to protect neutrality, trust, and
        reference-grade credibility.
      </p>

      <h2 className="fnm-title fnm-h2">Core principle (non-negotiable)</h2>
      <p>
        Advertising on FindWellnessNearMe.org provides visibility, not endorsement. This principle overrides all
        monetization decisions.
      </p>

      <h2 className="fnm-title fnm-h2">What “Featured” means (and does not mean)</h2>
      <p>
        Featured listings appear in clearly labeled “Featured” sections. They may receive placement priority, not
        content priority.
      </p>
      <p>
        Featured listings do not imply quality, recommendation, or endorsement. They do not override factual standards
        or taxonomy rules.
      </p>

      <h2 className="fnm-title fnm-h2">Acceptable featured content</h2>
      <p>All featured listing content must be factual, neutral, and verifiable from public sources.</p>
      <h3 className="fnm-title fnm-h3">Allowed</h3>
      <ul className="fnm-list fnm-mt-sm">
        <li>Business name</li>
        <li>Location</li>
        <li>Services offered</li>
        <li>Modality categories</li>
        <li>Years in operation (if factual)</li>
        <li>Public credentials (if verifiable)</li>
      </ul>
      <h3 className="fnm-title fnm-h3 fnm-mt-md">Not allowed</h3>
      <ul className="fnm-list fnm-mt-sm">
        <li>Testimonials, reviews, ratings</li>
        <li>Comparative claims (“best”, “top”, “leading”)</li>
        <li>Outcome claims (“heals”, “cures”, “guaranteed”)</li>
        <li>Emotional persuasion or urgency language</li>
      </ul>

      <h2 className="fnm-title fnm-h2">Visual rules</h2>
      <p>
        Featured listings must use the same typography and reference framing as organic listings. They differ only by
        placement and the label “Featured”.
      </p>
      <p>No bright colors, icons, call-to-action buttons, animations, or promotional hover effects.</p>

      <h2 className="fnm-title fnm-h2">Placement rules</h2>
      <p>
        Featured listings may appear only in clearly labeled featured sections, typically in the right rail. They may
        never be blended inline with organic listings.
      </p>

      <h2 className="fnm-title fnm-h2">Rotation and fairness</h2>
      <p>
        Featured listings rotate fairly within their tier. There are no permanent top locks, no pay-to-suppress, and no
        auction-based bidding.
      </p>

      <h2 className="fnm-title fnm-h2">Review process</h2>
      <p>
        Advertising submissions are manually reviewed for policy compliance before placement. Submissions may be edited
        for neutrality (with notice), returned for revision, or rejected if non-compliant.
      </p>

      <h2 className="fnm-title fnm-h2">Disclosure</h2>
      <p>
        Featured listings are paid placements and do not represent endorsements or recommendations. This disclosure is
        intended to be visible without being intrusive.
      </p>
    </div>
  );
}


