type LogoProps = {
  /** Defaults to "header". */
  context?: "header" | "footer" | "inline";
};

export function Logo({ context = "header" }: LogoProps) {
  return (
    <span
      aria-label="FindWellnessNearMe.org"
      className={`fnm-logo fnm-logo--${context}`}
    >
      <span>Find</span>
      <span className="fnm-logoBlue">Wellness</span>
      <span>NearMe.org</span>
    </span>
  );
}


