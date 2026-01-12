import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: { canonical: "/privacy" }
};

export default function PrivacyPage() {
  return (
    <div className="fnm-stack fnm-gap-md fnm-prose">
      <h1 className="fnm-title fnm-h1">Privacy Policy</h1>

      <p className="fnm-muted">
        Effective date: {new Date().getFullYear()}-01-01. This policy is a minimal, honest baseline and may be updated as
        the site evolves.
      </p>

      <h2 className="fnm-title fnm-h2">What we collect</h2>
      <p>
        We may collect basic operational data needed to run an informational directory, such as request logs, IP address,
        user agent, and search query parameters you submit (for example, query text and location filters).
      </p>

      <h2 className="fnm-title fnm-h2">What we do not collect</h2>
      <p>
        We do not currently offer user accounts. We do not intentionally collect sensitive health information, payment
        information, or personal profile data through normal browsing.
      </p>

      <h2 className="fnm-title fnm-h2">Cookies</h2>
      <p>
        The site may use cookies or similar technologies for basic functionality and measurement. If third-party services
        are enabled (such as analytics, hosting, or search providers), they may also set cookies according to their own
        policies.
      </p>

      <h2 className="fnm-title fnm-h2">Third-party services</h2>
      <p>
        We may rely on third-party infrastructure providers (for example, hosting, performance monitoring, analytics, or
        search APIs). These providers may process limited technical data to deliver their services.
      </p>

      <h2 className="fnm-title fnm-h2">No sale of personal data</h2>
      <p>We do not sell personal data.</p>

      <h2 className="fnm-title fnm-h2">Contact</h2>
      <p>
        For privacy questions or requests, contact: <a href="mailto:privacy@findwellnessnearme.org">privacy@findwellnessnearme.org</a>
      </p>
    </div>
  );
}


