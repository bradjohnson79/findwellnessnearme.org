import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FORM_CONFIRMATION_COPY } from "../../src/lib/confirmationCopy";
import { FramedSection } from "../../src/components/FramedSection";

export const metadata: Metadata = {
  title: "Advertising",
  alternates: { canonical: "/advertising" }
};

type Tier = "basic" | "enhanced" | "priority";

const PRICING: Record<
  Tier,
  {
    label: string;
    placement: string;
    visibility: string;
    monthlyUsd: number;
  }
> = {
  basic: {
    label: "Basic Featured",
    placement: "Right-rail featured section",
    visibility: "City + modality pages",
    monthlyUsd: 75
  },
  enhanced: {
    label: "Enhanced Featured",
    placement: "Right-rail + category prominence",
    visibility: "City, modality, search",
    monthlyUsd: 125
  },
  priority: {
    label: "Priority Featured",
    placement: "Top featured slot rotation",
    visibility: "City, modality, search",
    monthlyUsd: 200
  }
};

function clampMonths(m: number) {
  if (!Number.isFinite(m)) return 3;
  return Math.max(3, Math.min(12, Math.round(m)));
}

async function submitAdvertising(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().slice(0, 200);
  const websiteUrl = String(formData.get("websiteUrl") ?? "").trim().slice(0, 500);
  const tier = String(formData.get("tier") ?? "").trim();
  const months = clampMonths(Number(formData.get("months") ?? 3));
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);

  if (!name || !email || !websiteUrl) {
    redirect("/advertising?sent=0");
  }

  console.log("advertising_submission", { name, email, websiteUrl, tier, months, noteLen: note.length });
  redirect("/advertising?sent=1");
}

export default async function AdvertisingPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const sp = searchParams ?? {};
  const sentRaw = sp.sent;
  const sent = Array.isArray(sentRaw) ? sentRaw[0] : sentRaw;

  const tierRaw = sp.tier;
  const tierParam = (Array.isArray(tierRaw) ? tierRaw[0] : tierRaw) as Tier | undefined;
  const tier: Tier = tierParam === "enhanced" || tierParam === "priority" ? tierParam : "basic";

  const monthsParamRaw = sp.months;
  const months = clampMonths(Number(Array.isArray(monthsParamRaw) ? monthsParamRaw[0] : monthsParamRaw));

  const monthlyUsd = PRICING[tier].monthlyUsd;
  const totalUsd = monthlyUsd * months;

  return (
    <div className="fnm-stack fnm-gap-lg">
      <h1 className="fnm-title fnm-h1 fnm-prose">Advertising</h1>

      {sent === "1" ? (
        <div className="fnm-muted fnm-prose">
          <div>{FORM_CONFIRMATION_COPY.line1}</div>
          <div>{FORM_CONFIRMATION_COPY.line2}</div>
        </div>
      ) : null}

      <FramedSection title="Pricing">
        <div className="fnm-stack fnm-gap-sm">
          <div className="fnm-text-sm fnm-muted fnm-prose">
            All pricing is listed in USD. Featured placements provide visibility, not endorsement.
          </div>

          <div className="fnm-tableWrap">
            <table className="fnm-text-sm fnm-table">
              <thead>
                <tr>
                  <th align="left">Tier</th>
                  <th align="left">Placement</th>
                  <th align="left">Visibility</th>
                  <th align="left">Monthly Price</th>
                </tr>
              </thead>
              <tbody>
                {(["basic", "enhanced", "priority"] as Tier[]).map((k) => (
                  <tr key={k}>
                    <td>{PRICING[k].label}</td>
                    <td>{PRICING[k].placement}</td>
                    <td>{PRICING[k].visibility}</td>
                    <td>
                      ${PRICING[k].monthlyUsd} <span className="fnm-muted">USD</span> / month
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </FramedSection>

      <FramedSection title="Request Featured Placement">
        <div className="fnm-stack fnm-gap-md fnm-prose">
          <div className="fnm-text-sm fnm-muted">
            Minimum: 3 months. Maximum: 12 months. Increment: 1 month.
          </div>

          <form action={submitAdvertising} className="fnm-stack fnm-gap-sm">
            <label>
              <span className="fnm-text-sm fnm-muted">Name</span>
              <br />
              <input name="name" className="fnm-field" required maxLength={120} />
            </label>

            <label>
              <span className="fnm-text-sm fnm-muted">Email</span>
              <br />
              <input name="email" type="email" className="fnm-field" required maxLength={200} />
            </label>

            <label>
              <span className="fnm-text-sm fnm-muted">Website</span>
              <br />
              <input name="websiteUrl" className="fnm-field" required maxLength={500} placeholder="https://example.com" />
            </label>

            <label>
              <span className="fnm-text-sm fnm-muted">Tier</span>
              <br />
              <select name="tier" defaultValue={tier}>
                <option value="basic">Basic Featured — ${PRICING.basic.monthlyUsd} USD / month</option>
                <option value="enhanced">Enhanced Featured — ${PRICING.enhanced.monthlyUsd} USD / month</option>
                <option value="priority">Priority Featured — ${PRICING.priority.monthlyUsd} USD / month</option>
              </select>
            </label>

            <label>
              <span className="fnm-text-sm fnm-muted">Duration (months)</span>
              <br />
              <select name="months" defaultValue={String(months)}>
                {Array.from({ length: 10 }).map((_, i) => {
                  const m = i + 3;
                  return (
                    <option key={m} value={String(m)}>
                      {m}
                    </option>
                  );
                })}
              </select>
            </label>

            <div className="fnm-text-sm fnm-muted">
              ${totalUsd} USD total for {months} months
            </div>

            <label>
              <span className="fnm-text-sm fnm-muted">Notes (optional)</span>
              <br />
              <textarea name="note" rows={4} className="fnm-field" maxLength={2000} />
            </label>

            <div>
              <button type="submit">Submit</button>
            </div>
          </form>

          <div className="fnm-text-sm fnm-muted">
            Policy: <a href="/advertising/policy">Advertising Policy &amp; Featured Listing Rules</a>
          </div>
        </div>
      </FramedSection>
    </div>
  );
}


