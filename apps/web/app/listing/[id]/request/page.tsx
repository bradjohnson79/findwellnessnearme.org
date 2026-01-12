import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "../../../../src/lib/prisma";
import { PUBLIC_LISTING_WHERE } from "../../../../src/lib/publicFilters";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Claim / correction request",
  description: "Submit a claim or factual correction request for a listing."
};

const FIELD_OPTIONS = [
  { key: "displayName", label: "Name" },
  { key: "websiteUrl", label: "Website URL" },
  { key: "modalities", label: "Modalities" },
  { key: "location", label: "Location details" }
] as const;

export default async function ListingRequestPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const typeRaw = searchParams?.type;
  const type = Array.isArray(typeRaw) ? typeRaw[0] : typeRaw;
  const requestType = type === "CLAIM" ? "CLAIM" : "CORRECTION";

  const listing = await prisma.listing.findFirst({
    where: { id: params.id, ...PUBLIC_LISTING_WHERE },
    select: { id: true, displayName: true, websiteUrl: true, websiteDomain: true }
  });
  if (!listing) return notFound();

  const modalities = await prisma.modality.findMany({
    where: { isActive: true },
    select: { id: true, displayName: true, slug: true },
    orderBy: [{ displayName: "asc" }]
  });

  return (
    <div className="fnm-stack fnm-gap-md fnm-prose">
      <h1 className="fnm-title">
        {requestType === "CLAIM" ? "Claim this listing" : "Request a factual correction"}
      </h1>
      <div className="fnm-text-sm fnm-muted">
        Listing: <a href={`/listing/${listing.id}`}>{listing.displayName}</a> ({listing.websiteDomain})
      </div>

      <p>Requests are reviewed by humans. Submitting a request does not guarantee changes.</p>

      <form method="post" action="/api/claim-request" className="fnm-stack fnm-gap-md">
        <input type="hidden" name="listingId" value={listing.id} />
        <input type="hidden" name="requestType" value={requestType} />

        <fieldset className="fnm-fieldset">
          <legend>Requester</legend>
          <label>
            Name (required)
            <br />
            <input name="requesterName" required maxLength={120} className="fnm-field" />
          </label>
          <br />
          <label>
            Email (required)
            <br />
            <input
              name="requesterEmail"
              type="email"
              required
              maxLength={200}
              className="fnm-field"
            />
          </label>
          <br />
          <label>
            Relationship (required)
            <br />
            <select name="relationship" defaultValue="OTHER">
              <option value="OWNER">Owner</option>
              <option value="STAFF">Staff</option>
              <option value="REPRESENTATIVE">Representative</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
        </fieldset>

        <fieldset className="fnm-fieldset">
          <legend>What needs correction?</legend>
          {FIELD_OPTIONS.map((f) => (
            <label key={f.key} className="fnm-block">
              <input type="checkbox" name="fields" value={f.key} /> {f.label}
            </label>
          ))}
        </fieldset>

        <fieldset className="fnm-fieldset">
          <legend>Requested values (factual only)</legend>

          <label>
            Name
            <br />
            <input
              name="displayName"
              placeholder={listing.displayName}
              maxLength={140}
              className="fnm-field"
            />
          </label>

          <br />

          <label>
            Website URL
            <br />
            <input
              name="websiteUrl"
              placeholder={listing.websiteUrl}
              maxLength={500}
              className="fnm-field"
            />
          </label>

          <br />

          <label>
            Modalities (select all that apply)
            <br />
            <select name="modalitySlugs" multiple size={Math.min(10, Math.max(4, modalities.length))}>
              {modalities.map((m) => (
                <option key={m.id} value={m.slug}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </label>

          <br />

          <div className="fnm-text-sm fnm-muted">
            Location request (optional): provide canonical slugs for state/city if known.
          </div>
          <label>
            State slug (e.g. california)
            <br />
            <input name="stateSlug" maxLength={80} />
          </label>
          <br />
          <label>
            City slug (e.g. los-angeles)
            <br />
            <input name="citySlug" maxLength={80} />
          </label>
          <br />
          <label>
            Street 1
            <br />
            <input name="street1" maxLength={200} className="fnm-field" />
          </label>
          <br />
          <label>
            Street 2
            <br />
            <input name="street2" maxLength={200} className="fnm-field" />
          </label>
          <br />
          <label>
            Postal code
            <br />
            <input name="postalCode" maxLength={20} />
          </label>
        </fieldset>

        <fieldset className="fnm-fieldset">
          <legend>Optional explanation</legend>
          <textarea name="note" rows={4} maxLength={800} className="fnm-field" />
          <div className="fnm-text-sm fnm-muted fnm-mt-xs">
            Plain text only. No marketing language.
          </div>
        </fieldset>

        <button type="submit">Submit request</button>
      </form>
    </div>
  );
}


