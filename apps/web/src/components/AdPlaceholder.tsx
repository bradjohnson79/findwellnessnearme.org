type Props = {
  /** Optional label; defaults to "Advertisement". */
  label?: string;
};

/**
 * Phase 9.7 — Ad Placeholder contract
 * - Structural only, subtle border
 * - No brand blue
 * - Always reserves space (CSS min-height)
 */
export function AdPlaceholder({ label = "Advertisement" }: Props) {
  return (
    <div className="fnm-adPlaceholder" aria-label="Advertisement placeholder">
      <div className="fnm-adPlaceholderText">{label}</div>
    </div>
  );
}


