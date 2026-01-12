import { FramedSection } from "../../../src/components/FramedSection";

export default function SearchRail() {
  return (
    <div className="fnm-stack fnm-gap-lg">
      <FramedSection title="Featured Wellness">
        <div className="fnm-text-sm fnm-muted">
          Reserved module. Featured informational content will appear here in a clearly labeled format.
        </div>
      </FramedSection>

      <FramedSection title="Sponsored Listings">
        <div className="fnm-text-sm fnm-muted">
          Reserved module. Sponsored placements will appear only in this rail and will always be labeled.
        </div>
      </FramedSection>

      <FramedSection title="Related Categories">
        <div className="fnm-text-sm fnm-muted">
          Reserved module. Related modalities and locations will appear here as plain links.
        </div>
      </FramedSection>
    </div>
  );
}


