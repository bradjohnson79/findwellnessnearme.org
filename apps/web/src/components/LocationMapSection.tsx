import { FramedSection } from "./FramedSection";
import { LocationMap } from "./LocationMap";

type Props = {
  geocodeQuery: string | null;
  tooltipLabel: string | null;
};

/**
 * Phase 9.5.15+ — Map section contract
 * - Must be framed (blue header bar)
 * - Header label EXACT: "Location Map"
 * - Placed after informational content and before footer
 * - Lazy-load provider only when scrolled into view
 */
export function LocationMapSection({ geocodeQuery, tooltipLabel }: Props) {
  return (
    <FramedSection title="Location Map">
      <LocationMap geocodeQuery={geocodeQuery} tooltipLabel={tooltipLabel} />
    </FramedSection>
  );
}


